import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BookMarked, Clock, File, Folder, Search } from "lucide-react";
import { usePanesStore } from "../stores/panes";
import { useBookmarksStore } from "../stores/bookmarks";
import { useUiStore } from "../stores/ui";
import { parentPath } from "../lib/path";

interface Candidate {
  path: string;
  name: string;
  source: "bookmark" | "recent" | "index";
  isDir: boolean;
  matchIndices?: number[];
}

const basename = (path: string) =>
  path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1) || "/";

function HighlightedName({ name, indices }: { name: string; indices?: number[] }) {
  if (!indices || indices.length === 0) return <>{name}</>;
  const set = new Set(indices);
  return (
    <>
      {Array.from(name).map((char, i) =>
        set.has(i) ? (
          <span key={i} className="match-char">
            {char}
          </span>
        ) : (
          <span key={i}>{char}</span>
        ),
      )}
    </>
  );
}

function bookmarkIndices(name: string, lower: string): number[] {
  if (!lower) return [];
  const start = name.toLowerCase().indexOf(lower);
  if (start < 0) return [];
  return Array.from({ length: lower.length }, (_, i) => start + i);
}

export function PaletteView() {
  const open = useUiStore((state) => state.paletteOpen);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [index, setIndex] = useState(0);
  const [indexVersion, setIndexVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
    void invoke("prepare_index").catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unlisten = listen("index-ready", () => {
      setIndexVersion((version) => version + 1);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const seq = ++seqRef.current;
    const timer = setTimeout(() => {
      const trimmed = query.trim();
      const lower = trimmed.toLowerCase();
      const bookmarkHits: Candidate[] = useBookmarksStore
        .getState()
        .bookmarks.filter(
          (item) =>
            !lower ||
            item.name.toLowerCase().includes(lower) ||
            item.path.toLowerCase().includes(lower),
        )
        .slice(0, 5)
        .map((item) => ({
          path: item.path,
          name: item.name,
          source: "bookmark" as const,
          isDir: true,
          matchIndices: bookmarkIndices(item.name, lower),
        }));

      invoke<{ path: string; score: number; isDir: boolean; matchIndices: number[] }[]>(
        "query_jump",
        {
          query: trimmed,
          limit: 20,
        },
      )
        .then((rows) => {
          if (seqRef.current !== seq) return;
          const seen = new Set(bookmarkHits.map((item) => item.path));
          const rest: Candidate[] = rows
            .filter((row) => !seen.has(row.path))
            .map((row) => ({
              path: row.path,
              name: basename(row.path),
              source: "index" as const,
              isDir: row.isDir,
              matchIndices: row.matchIndices,
            }));
          setResults([...bookmarkHits, ...rest].slice(0, 20));
          setIndex(0);
        })
        .catch(() => {
          if (seqRef.current === seq) {
            setResults(bookmarkHits);
            setIndex(0);
          }
        });
    }, 100);
    return () => clearTimeout(timer);
  }, [query, open, indexVersion]);

  useEffect(() => {
    listRef.current
      ?.querySelector(".palette-item.selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [index, results.length]);

  if (!open) return null;

  const close = () => useUiStore.getState().setPaletteOpen(false);

  const jump = (item: Candidate) => {
    close();
    const store = usePanesStore.getState();
    if (item.isDir) {
      void store.navigate(item.path);
    } else {
      void store.navigate(parentPath(item.path)).then(() => {
        usePanesStore.getState().cursorToPath(item.path);
      });
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "ArrowDown" || (event.ctrlKey && event.key === "n")) {
      event.preventDefault();
      setIndex((value) => Math.min(value + 1, Math.max(0, results.length - 1)));
    } else if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
      event.preventDefault();
      setIndex((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[index];
      if (item) {
        jump(item);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="dialog-backdrop palette-backdrop" onMouseDown={close}>
      <div className="palette-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-search">
          <Search size={16} strokeWidth={2} className="palette-search-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="フォルダ・ファイルを検索"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
        <div className="palette-results" ref={listRef}>
          {results.map((item, i) => (
            <button
              key={item.path}
              className={i === index ? "palette-item selected" : "palette-item"}
              onMouseEnter={() => setIndex(i)}
              onClick={() => jump(item)}
              title={item.path}
            >
              <span className="palette-item-icon">
                {item.source === "bookmark" ? (
                  <BookMarked size={14} strokeWidth={1.8} />
                ) : !item.isDir ? (
                  <File size={14} strokeWidth={1.8} />
                ) : item.source === "recent" ? (
                  <Clock size={14} strokeWidth={1.8} />
                ) : (
                  <Folder size={14} strokeWidth={1.8} />
                )}
              </span>
              <span className="palette-item-name">
                <HighlightedName name={item.name} indices={item.matchIndices} />
              </span>
              <span className="palette-item-path">{item.path}</span>
            </button>
          ))}
          {results.length === 0 && query && (
            <div className="preview-note">候補がありません</div>
          )}
        </div>
        <div className="palette-footer">
          <span>
            <kbd>↑↓</kbd> 選択
          </span>
          <span>
            <kbd>Enter</kbd> 移動
          </span>
          <span>
            <kbd>Esc</kbd> 閉じる
          </span>
        </div>
      </div>
    </div>
  );
}
