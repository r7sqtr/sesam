import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { BookMarked, ChevronLeft, ChevronRight, House, PenLine, Star, X } from "lucide-react";
import { usePanesStore } from "../stores/panes";
import { useBookmarksStore } from "../stores/bookmarks";
import { useUiStore } from "../stores/ui";
import { pathSegments } from "../lib/path";
import { getHomePath } from "../lib/home";

export function PathBar({ paneIndex }: { paneIndex: number }) {
  const cwd = usePanesStore((state) => state.panes[paneIndex]?.cwd ?? "");
  const loading = usePanesStore((state) => state.panes[paneIndex]?.loading);
  const truncated = usePanesStore((state) => state.panes[paneIndex]?.truncated);
  const canBack = usePanesStore(
    (state) => (state.panes[paneIndex]?.backStack.length ?? 0) > 0,
  );
  const canForward = usePanesStore(
    (state) => (state.panes[paneIndex]?.fwdStack.length ?? 0) > 0,
  );
  const isActivePane = usePanesStore((state) => state.active === paneIndex);
  const pathEditing = useUiStore((state) => state.pathEditing);
  const dropTargetPath = useUiStore((state) => state.dropTargetPath);
  const bookmarks = useBookmarksStore((state) => state.bookmarks);
  const navigate = usePanesStore((state) => state.navigate);

  const editing = pathEditing && isActivePane;
  const isBookmarked = bookmarks.some((item) => item.path === cwd);
  const [value, setValue] = useState(cwd);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<string | null>(null);
  const [bookmarkName, setBookmarkName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const completionsRef = useRef<{ list: string[]; index: number } | null>(null);

  useEffect(() => {
    if (editing) {
      setValue(cwd);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(cwd.length, cwd.length);
      });
    }
  }, [editing, cwd]);

  const segments = cwd ? pathSegments(cwd) : [];
  const withActive = (action: () => void) => {
    usePanesStore.getState().setActive(paneIndex);
    action();
  };

  const commitPath = async () => {
    let target = value.trim();
    if (!target) return;
    if (target.startsWith("~")) {
      const home = (await homeDir()).replace(/\/$/, "");
      target = home + target.slice(1);
    }
    if (target !== "/" && target.endsWith("/")) {
      target = target.slice(0, -1);
    }
    useUiStore.getState().setPathEditing(false);
    void navigate(target, paneIndex);
  };

  const completeTab = async () => {
    const cycle = completionsRef.current;
    const bare = value.replace(/\/$/, "");
    if (cycle && cycle.list.length > 1 && cycle.list.includes(bare)) {
      cycle.index = (cycle.index + 1) % cycle.list.length;
      setValue(`${cycle.list[cycle.index]}/`);
      return;
    }
    try {
      const list = await invoke<string[]>("complete_path", { partial: value });
      if (list.length === 0) return;
      if (list.length === 1) {
        completionsRef.current = null;
        setValue(`${list[0]}/`);
        return;
      }
      let prefix = list[0];
      for (const item of list) {
        while (!item.startsWith(prefix)) {
          prefix = prefix.slice(0, -1);
        }
      }
      if (prefix.length > value.length) {
        completionsRef.current = { list, index: -1 };
        setValue(prefix);
      } else {
        completionsRef.current = { list, index: 0 };
        setValue(`${list[0]}/`);
      }
    } catch {
      /* 補完失敗は無視 */
    }
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      void commitPath();
    } else if (event.key === "Tab") {
      event.preventDefault();
      void completeTab();
    } else if (event.key === "Escape") {
      event.preventDefault();
      useUiStore.getState().setPathEditing(false);
    }
  };

  return (
    <div className="path-bar">
      <button
        className="nav-btn"
        disabled={!canBack}
        title="戻る (Ctrl+O)"
        onClick={() => withActive(() => void usePanesStore.getState().goBack())}
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>
      <button
        className="nav-btn"
        disabled={!canForward}
        title="進む (Ctrl+I)"
        onClick={() => withActive(() => void usePanesStore.getState().goForward())}
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>
      <button
        className="nav-btn"
        title="ホームへ移動（設定で変更可）"
        onClick={() =>
          withActive(() => {
            void getHomePath().then((home) => navigate(home, paneIndex));
          })
        }
      >
        <House size={14} strokeWidth={1.8} />
      </button>
      <button
        className="nav-btn"
        title="ブックマーク一覧"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenuPos({ x: rect.left, y: rect.bottom + 4 });
        }}
      >
        <BookMarked size={14} strokeWidth={1.8} />
      </button>
      <button
        className={isBookmarked ? "nav-btn bookmarked" : "nav-btn"}
        title={isBookmarked ? "ブックマークを解除" : "このフォルダをブックマーク"}
        onClick={() =>
          withActive(() => {
            void useBookmarksStore.getState().toggleBookmark(cwd);
            useUiStore
              .getState()
              .setToast(isBookmarked ? "ブックマークを解除しました" : "ブックマークしました");
          })
        }
      >
        <Star size={14} strokeWidth={1.8} fill={isBookmarked ? "currentColor" : "none"} />
      </button>
      {editing ? (
        <input
          ref={inputRef}
          className="path-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onInputKeyDown}
          onBlur={() => useUiStore.getState().setPathEditing(false)}
          placeholder="/path/to/folder（~ 可、Enter で移動）"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      ) : (
        <div
          className="breadcrumbs"
          title="クリックでパスを直接入力 (⌘⇧G)"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              withActive(() => useUiStore.getState().setPathEditing(true));
            }
          }}
        >
          {segments.map((segment, index) => (
            <span key={segment.path} className="crumb-wrap">
              {index > 1 && <span className="crumb-sep">›</span>}
              <button
                className={[
                  "crumb",
                  index === segments.length - 1 ? "current" : "",
                  dropTargetPath === segment.path ? "drop-hover" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-drop-dir={segment.path}
                onClick={() => withActive(() => void navigate(segment.path, paneIndex))}
              >
                {segment.name}
              </button>
            </span>
          ))}
        </div>
      )}
      {!editing && (
        <button
          className="nav-btn"
          title="パスを直接入力 (⌘⇧G)"
          onClick={() => withActive(() => useUiStore.getState().setPathEditing(true))}
        >
          <PenLine size={13} strokeWidth={1.8} />
        </button>
      )}
      {loading && <span className="path-note">読み込み中…</span>}
      {truncated && <span className="path-note warn">5万件で打ち切り</span>}
      {menuPos && (
        <div className="context-backdrop" onMouseDown={() => setMenuPos(null)}>
          <div
            className="context-menu bm-menu"
            style={{ left: Math.min(menuPos.x, window.innerWidth - 300), top: menuPos.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {bookmarks.map((item) => (
              <div key={item.path} className="bm-row">
                {editingBookmark === item.path ? (
                  <input
                    className="bm-name-input"
                    value={bookmarkName}
                    autoFocus
                    spellCheck={false}
                    onChange={(event) => setBookmarkName(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        void useBookmarksStore
                          .getState()
                          .renameBookmark(item.path, bookmarkName);
                        setEditingBookmark(null);
                      } else if (event.key === "Escape") {
                        setEditingBookmark(null);
                      }
                    }}
                    onBlur={() => setEditingBookmark(null)}
                  />
                ) : (
                  <button
                    className="context-item bm-jump"
                    title={item.path}
                    onClick={() => {
                      setMenuPos(null);
                      withActive(() => void navigate(item.path, paneIndex));
                    }}
                  >
                    <span className="bm-name">{item.name}</span>
                  </button>
                )}
                <button
                  className="bm-remove"
                  title="名前を変更"
                  onClick={() => {
                    setEditingBookmark(item.path);
                    setBookmarkName(item.name);
                  }}
                >
                  <PenLine size={12} />
                </button>
                <button
                  className="bm-remove"
                  title="削除"
                  onClick={() =>
                    void useBookmarksStore.getState().removeBookmark(item.path)
                  }
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {bookmarks.length === 0 && (
              <div className="preview-note">ブックマークがありません</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
