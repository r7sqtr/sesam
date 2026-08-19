import { getCurrentWebview } from "@tauri-apps/api/webview";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { activePane, usePanesStore } from "./stores/panes";
import { useUiStore } from "./stores/ui";
import { beginTransfer } from "./ops";
import { parentPath } from "./lib/path";

const DRAG_OUT_SETTLE_MS = 200;

let dragOutInProgress = false;

function endDragOut() {
  dragOutInProgress = false;
}

function dragIcon(count: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 44;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "data:image/png;base64,";
  ctx.fillStyle = "rgba(40, 40, 46, 0.95)";
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(2, 2, 116, 40, 10);
    ctx.fill();
  } else {
    ctx.fillRect(2, 2, 116, 40);
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.font = "600 15px -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`${count} 項目`, 16, 24);
  return canvas.toDataURL("image/png");
}

export async function startDragOut(path: string, paneIndex: number) {
  const state = usePanesStore.getState();
  const pane = state.panes[paneIndex];
  if (!pane) return;
  let paths: string[] = [path];
  if (state.active === paneIndex && pane.visualAnchor !== null) {
    const start = Math.min(pane.visualAnchor, pane.cursor);
    const end = Math.max(pane.visualAnchor, pane.cursor);
    const range = pane.visible.slice(start, end + 1).map((entry) => entry.path);
    if (range.includes(path)) {
      paths = range;
    }
  } else if (pane.marked.size > 0 && pane.marked.has(path)) {
    paths = pane.visible
      .filter((entry) => pane.marked.has(entry.path))
      .map((entry) => entry.path);
  }
  dragOutInProgress = true;
  try {
    await startDrag({ item: paths, icon: dragIcon(paths.length) }, () => {
      window.setTimeout(endDragOut, DRAG_OUT_SETTLE_MS);
    });
  } catch (error) {
    endDragOut();
    useUiStore.getState().setToast(String(error));
  }
}

function elementAt(position: { x: number; y: number }): Element | null {
  return document.elementFromPoint(position.x, position.y);
}

function folderAt(position: { x: number; y: number }): string | null {
  const element = elementAt(position);
  const row = element?.closest("[data-path]");
  if (row) {
    if (row.getAttribute("data-dir") !== "true") return null;
    return row.getAttribute("data-path");
  }
  const crumb = element?.closest("[data-drop-dir]");
  if (crumb) {
    return crumb.getAttribute("data-drop-dir");
  }
  return null;
}

function paneCwdAt(position: { x: number; y: number }): string | null {
  const paneEl = elementAt(position)?.closest("[data-pane]");
  if (!paneEl) return null;
  const index = Number(paneEl.getAttribute("data-pane"));
  return usePanesStore.getState().panes[index]?.cwd ?? null;
}

function handleDrop(paths: string[], position: { x: number; y: number }) {
  const internal = dragOutInProgress;
  endDragOut();
  const targetDir =
    folderAt(position) ?? paneCwdAt(position) ?? activePane(usePanesStore.getState()).cwd;
  if (!targetDir) return;
  const sources = paths.filter((path) => parentPath(path) !== targetDir);
  if (sources.length === 0) return;
  void beginTransfer(sources, targetDir, internal);
}

export function setupDragDrop() {
  return getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === "over") {
      useUiStore.getState().setDropTargetPath(folderAt(payload.position));
    } else if (payload.type === "drop") {
      useUiStore.getState().setDropTargetPath(null);
      handleDrop(payload.paths, payload.position);
    } else {
      useUiStore.getState().setDropTargetPath(null);
    }
  });
}
