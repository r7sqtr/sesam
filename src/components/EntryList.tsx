import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePanesStore } from "../stores/panes";
import { useRegisterStore } from "../stores/register";
import { useUiStore } from "../stores/ui";
import { startDragOut } from "../dnd";
import { EntryRow } from "./EntryRow";

const ROW_HEIGHT = 34;
const BAND_THRESHOLD = 4;

interface Band {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function EntryList({ paneIndex }: { paneIndex: number }) {
  const visible = usePanesStore((state) => state.panes[paneIndex]?.visible);
  const cursor = usePanesStore((state) => state.panes[paneIndex]?.cursor ?? 0);
  const error = usePanesStore((state) => state.panes[paneIndex]?.error);
  const loading = usePanesStore((state) => state.panes[paneIndex]?.loading);
  const marked = usePanesStore((state) => state.panes[paneIndex]?.marked);
  const visualAnchor = usePanesStore((state) => state.panes[paneIndex]?.visualAnchor ?? null);
  const isActive = usePanesStore((state) => state.active === paneIndex);
  const setPageSize = usePanesStore((state) => state.setPageSize);
  const register = useRegisterStore((state) => state.register);
  const dropTargetPath = useUiStore((state) => state.dropTargetPath);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [band, setBand] = useState<Band | null>(null);

  const entries = visible ?? [];
  const markedSet = marked ?? new Set<string>();

  const cutSet = useMemo(
    () => (register?.isCut ? new Set(register.paths) : new Set<string>()),
    [register],
  );
  const rangeStart =
    isActive && visualAnchor !== null ? Math.min(visualAnchor, cursor) : -1;
  const rangeEnd =
    isActive && visualAnchor !== null ? Math.max(visualAnchor, cursor) : -1;

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setPageSize(Math.floor(element.clientHeight / ROW_HEIGHT));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [setPageSize]);

  useEffect(() => {
    if (entries.length > 0) {
      virtualizer.scrollToIndex(Math.min(cursor, entries.length - 1), { align: "auto" });
    }
  }, [cursor, entries.length, virtualizer]);

  const rowFromEvent = (event: React.MouseEvent): HTMLElement | null =>
    (event.target as HTMLElement).closest("[data-path]");

  const startBand = (event: React.MouseEvent) => {
    const inner = innerRef.current;
    if (!inner || entries.length === 0) return;
    const originRect = inner.getBoundingClientRect();
    const originX = event.clientX - originRect.left;
    const originY = event.clientY - originRect.top;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let lastFrom = -1;
    let lastTo = -1;

    const onMove = (move: MouseEvent) => {
      if (!moved) {
        if (
          Math.abs(move.clientX - startX) + Math.abs(move.clientY - startY) <
          BAND_THRESHOLD
        ) {
          return;
        }
        moved = true;
      }
      const rect = inner.getBoundingClientRect();
      const currentX = move.clientX - rect.left;
      const currentY = move.clientY - rect.top;
      const top = Math.min(originY, currentY);
      const bottom = Math.max(originY, currentY);
      setBand({
        top,
        left: Math.min(originX, currentX),
        width: Math.abs(currentX - originX),
        height: bottom - top,
      });
      const from = Math.max(0, Math.floor(top / ROW_HEIGHT));
      const to = Math.min(entries.length - 1, Math.floor(bottom / ROW_HEIGHT));
      if (from === lastFrom && to === lastTo) return;
      lastFrom = from;
      lastTo = to;
      const paths = to >= from ? entries.slice(from, to + 1).map((entry) => entry.path) : [];
      usePanesStore.getState().setMarked(paneIndex, paths);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setBand(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onMouseDown = (event: React.MouseEvent) => {
    usePanesStore.getState().setActive(paneIndex);
    if (event.button !== 0) return;
    const row = rowFromEvent(event);
    if (!row) {
      startBand(event);
      return;
    }
    const path = row.getAttribute("data-path");
    if (!path) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let started = false;
    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    const onMove = (move: MouseEvent) => {
      if (started) return;
      if (Math.abs(move.clientX - startX) + Math.abs(move.clientY - startY) > 6) {
        started = true;
        cleanup();
        void startDragOut(path, paneIndex);
      }
    };
    const onUp = () => cleanup();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onClick = (event: React.MouseEvent) => {
    const path = rowFromEvent(event)?.getAttribute("data-path");
    if (path) {
      usePanesStore.getState().cursorToPath(path);
    }
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    const row = rowFromEvent(event);
    const path = row?.getAttribute("data-path");
    if (!row || !path) return;
    if (row.getAttribute("data-dir") === "true") {
      void usePanesStore.getState().navigate(path, paneIndex);
    } else {
      void invoke("open_entries", { paths: [path] });
    }
  };

  const onContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    usePanesStore.getState().setActive(paneIndex);
    const path = rowFromEvent(event)?.getAttribute("data-path") ?? null;
    if (path) {
      usePanesStore.getState().cursorToPath(path);
    }
    useUiStore.getState().setContextMenu({
      x: event.clientX,
      y: event.clientY,
      entryPath: path,
    });
  };

  if (error) {
    return (
      <div className="entry-list-message error" ref={scrollRef}>
        {error}
      </div>
    );
  }

  if (!loading && entries.length === 0) {
    return (
      <div className="entry-list-message" ref={scrollRef}>
        Empty
      </div>
    );
  }

  return (
    <div
      className="entry-list"
      ref={scrollRef}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div
        className="entry-list-inner"
        ref={innerRef}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {band && (
          <div
            className="rubber-band"
            style={{
              top: band.top,
              left: band.left,
              width: band.width,
              height: band.height,
            }}
          />
        )}
        {virtualizer.getVirtualItems().map((item) => {
          const entry = entries[item.index];
          return (
            <div
              key={entry.path}
              className="entry-slot"
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
            >
              <EntryRow
                entry={entry}
                active={isActive && item.index === cursor}
                marked={markedSet.has(entry.path)}
                inRange={item.index >= rangeStart && item.index <= rangeEnd}
                cut={cutSet.has(entry.path)}
                dropTarget={entry.isDir && entry.path === dropTargetPath}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
