import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useIcon } from "../lib/iconCache";

interface AppInfo {
  name: string;
  path: string;
}

interface OpenWithDialogProps {
  paths: string[];
  dirPath: string;
  onClose: () => void;
}

function AppItem({
  app,
  selected,
  onHover,
  onPick,
}: {
  app: AppInfo;
  selected: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const iconSrc = useIcon(app.path, app.path);
  return (
    <button
      className={selected ? "app-item selected" : "app-item"}
      onMouseEnter={onHover}
      onClick={onPick}
    >
      {iconSrc ? (
        <img className="app-icon" src={iconSrc} alt="" draggable={false} />
      ) : (
        <span className="app-icon placeholder" />
      )}
      {app.name}
    </button>
  );
}

export function OpenWithDialog({ paths, dirPath, onClose }: OpenWithDialogProps) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void invoke<AppInfo[]>("list_applications").then(setApps);
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    return apps.filter((app) => app.name.toLowerCase().includes(lower)).slice(0, 80);
  }, [apps, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(".app-item.selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [index, filtered.length]);

  const openWith = (app: AppInfo) => {
    onClose();
    void invoke("open_with_app", { paths, app: app.path });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setIndex((value) => Math.min(value + 1, Math.max(0, filtered.length - 1)));
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setIndex((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const app = filtered[index];
      if (app) openWith(app);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog open-with-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-title">別のアプリで開く（{paths.length}件）</div>
        <div className="quick-actions">
          <button
            className="settings-btn"
            onClick={() => {
              onClose();
              void invoke("open_entries", { paths });
            }}
          >
            既定のアプリで開く
          </button>
          <button
            className="settings-btn"
            onClick={() => {
              onClose();
              void invoke("reveal_in_finder", { path: paths[0] });
            }}
          >
            Finder で表示
          </button>
          <button
            className="settings-btn"
            onClick={() => {
              onClose();
              void invoke("open_with_app", { paths: [dirPath], app: "Terminal" });
            }}
          >
            ターミナルで開く
          </button>
        </div>
        <input
          ref={inputRef}
          className="app-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="アプリ名で検索（↑↓ で選択、Enter で開く）"
          spellCheck={false}
        />
        <div className="app-list" ref={listRef}>
          {apps.length === 0 && <div className="preview-note">読み込み中…</div>}
          {filtered.map((app, i) => (
            <AppItem
              key={app.path}
              app={app}
              selected={i === index}
              onHover={() => setIndex(i)}
              onPick={() => openWith(app)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
