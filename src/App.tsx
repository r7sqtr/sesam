import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowUpDown,
  Columns2,
  FolderPlus,
  PanelRight,
  Pin,
  Search,
  Settings,
} from "lucide-react";
import { useUiStore } from "./stores/ui";
import { usePanesStore } from "./stores/panes";
import { ensureConfigLoaded, getConfigSection } from "./stores/config";
import { requestMkdir } from "./ops";
import { redo, undo } from "./undo";
import { FileManagerView } from "./components/FileManagerView";
import { PaletteView } from "./components/PaletteView";
import "./App.css";

function App() {
  const pinned = useUiStore((state) => state.pinned);
  const setPinned = useUiStore((state) => state.setPinned);

  useEffect(() => {
    void ensureConfigLoaded().then(() => {
      const saved = getConfigSection<number>("opacity");
      if (typeof saved === "number") {
        useUiStore.getState().setOpacity(saved);
      }
    });
    invoke<boolean>("get_pinned").then(setPinned);
    const unlistenPin = listen<boolean>("pin-changed", (event) => {
      setPinned(event.payload);
    });
    return () => {
      unlistenPin.then((unlisten) => unlisten());
    };
  }, [setPinned]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key.toLowerCase() === "p" && event.metaKey && event.shiftKey) {
        event.preventDefault();
        invoke("set_pinned", { pinned: !pinned });
        return;
      }
      const target = event.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (event.metaKey && event.key.toLowerCase() === "z" && !isEditable) {
        event.preventDefault();
        if (event.shiftKey) {
          void redo();
        } else {
          void undo();
        }
        return;
      }
      if (event.metaKey && event.key.toLowerCase() === "t" && !event.shiftKey) {
        event.preventDefault();
        usePanesStore.getState().newTab();
        return;
      }
      if (event.metaKey && event.key.toLowerCase() === "w" && !event.shiftKey) {
        event.preventDefault();
        const state = usePanesStore.getState();
        state.closeTab(state.activeTab);
        return;
      }
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        useUiStore.getState().setPathEditing(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pinned]);

  return (
    <div className="shell">
      <div
        className="shell-header"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          if ((event.target as HTMLElement).closest("button")) return;
          void getCurrentWindow().startDragging();
        }}
      >
        <span className="brand">sesam</span>
        <div className="header-actions">
          <button
            className="icon-btn"
            title="検索パレット (f)"
            onClick={() => useUiStore.getState().setPaletteOpen(true)}
          >
            <Search size={15} strokeWidth={1.8} />
          </button>
          <button
            className="icon-btn"
            title="2ペイン分割 (\)"
            onClick={() => usePanesStore.getState().toggleDual()}
          >
            <Columns2 size={15} strokeWidth={1.8} />
          </button>
          <button
            className="icon-btn"
            title="プレビュー表示切替 (i)"
            onClick={() => useUiStore.getState().togglePreview()}
          >
            <PanelRight size={15} strokeWidth={1.8} />
          </button>
          <button
            className="icon-btn"
            title="並び替え (s)"
            onClick={() => useUiStore.getState().setDialog({ kind: "sort" })}
          >
            <ArrowUpDown size={15} strokeWidth={1.8} />
          </button>
          <button
            className="icon-btn"
            title="新規フォルダ (a)"
            onClick={() => requestMkdir()}
          >
            <FolderPlus size={15} strokeWidth={1.8} />
          </button>
          <button
            className="icon-btn"
            title="設定 (,)"
            onClick={() => useUiStore.getState().setSettingsOpen(true)}
          >
            <Settings size={15} strokeWidth={1.8} />
          </button>
          <button
            className={pinned ? "icon-btn active" : "icon-btn"}
            title="ピン留め切替 (⌘+Shift+P)"
            onClick={() => invoke("set_pinned", { pinned: !pinned })}
          >
            <Pin size={15} strokeWidth={1.8} fill={pinned ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
      <FileManagerView />
      <PaletteView />
    </div>
  );
}

export default App;
