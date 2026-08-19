import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getHomePath } from "../lib/home";
import { activePane, resumeWatchers, suspendWatchers, usePanesStore } from "../stores/panes";
import { useUiStore } from "../stores/ui";
import { useTasksStore } from "../stores/tasks";
import { createKeyEngine, type KeyEngine } from "../keys/engine";
import { presetBindings, type Action } from "../keys/bindings";
import { applyOverrides } from "../keys/overrides";
import { useKeymapStore } from "../keys/keymapStore";
import {
  cancelActiveTask,
  clearRegister,
  compressSelection,
  paste,
  requestMkdir,
  requestRename,
  requestTrash,
  selectionEntries,
  yankOrCut,
} from "../ops";
import { useBookmarksStore } from "../stores/bookmarks";
import { commitJournal, discardJournal, type TransferResult } from "../undo";
import { resolveTask } from "../taskWait";
import { setupDragDrop } from "../dnd";
import { ContextMenu } from "./ContextMenu";
import { DirPane } from "./DirPane";
import { TabStrip } from "./TabStrip";
import { isPreviewable, PreviewPane } from "./PreviewPane";
import { SettingsView } from "./SettingsView";
import { StatusBar } from "./StatusBar";
import { FilterInput } from "./FilterInput";
import { CommandLine } from "./CommandLine";
import { Dialogs } from "./Dialogs";

function refreshAllPanes() {
  const state = usePanesStore.getState();
  state.panes.forEach((_, index) => {
    void state.refreshPane(index);
  });
}

function trackDrag(onMove: (event: MouseEvent) => void) {
  document.body.classList.add("dragging-divider");
  const cleanup = () => {
    document.body.classList.remove("dragging-divider");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", cleanup);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", cleanup);
}

function PaneDivider() {
  const onMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    const container = (event.currentTarget as HTMLElement).parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    trackDrag((move) => {
      useUiStore.getState().setPaneRatio((move.clientX - rect.left) / rect.width);
    });
  };
  return <div className="divider" onMouseDown={onMouseDown} />;
}

function PreviewDivider() {
  const onMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    const row = (event.currentTarget as HTMLElement).parentElement;
    if (!row) return;
    const rect = row.getBoundingClientRect();
    trackDrag((move) => {
      useUiStore.getState().setPreviewWidth(rect.right - move.clientX);
    });
  };
  return <div className="divider" onMouseDown={onMouseDown} />;
}

export function FileManagerView() {
  const mode = useUiStore((state) => state.mode);
  const toast = useUiStore((state) => state.toast);
  const paneCount = usePanesStore((state) => state.panes.length);
  const paneRatio = useUiStore((state) => state.paneRatio);
  const previewVisible = useUiStore((state) => state.previewVisible);
  const previewable = usePanesStore((state) => {
    const pane = state.panes[state.active];
    return isPreviewable(pane?.visible[pane.cursor] ?? null);
  });
  const previewShown = previewVisible && previewable;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const [engines, setEngines] = useState<{ normal: KeyEngine; visual: KeyEngine } | null>(null);
  const enginesRef = useRef(engines);
  enginesRef.current = engines;
  const keymapVersion = useKeymapStore((state) => state.version);

  useEffect(() => {
    void useKeymapStore.getState().load();
    void useBookmarksStore.getState().load();
  }, []);

  useEffect(() => {
    if (!useKeymapStore.getState().loaded) return;
    const dispatch = (action: Action, count: number) => {
      const panes = usePanesStore.getState();
      const ui = useUiStore.getState();
      switch (action) {
        case "cursor-down":
          panes.moveCursor(count);
          break;
        case "cursor-up":
          panes.moveCursor(-count);
          break;
        case "cursor-top":
          panes.cursorTo(0);
          break;
        case "cursor-bottom":
          panes.cursorTo(activePane(panes).visible.length - 1);
          break;
        case "half-down":
          panes.moveCursor(Math.max(1, Math.floor(panes.pageSize / 2)) * count);
          break;
        case "half-up":
          panes.moveCursor(-Math.max(1, Math.floor(panes.pageSize / 2)) * count);
          break;
        case "enter":
          panes.enter();
          break;
        case "parent":
          panes.parent();
          break;
        case "toggle-hidden":
          panes.toggleHidden();
          break;
        case "cycle-sort":
          ui.setDialog({ kind: "sort" });
          break;
        case "open-with": {
          const entries = selectionEntries();
          if (entries.length === 0) break;
          ui.setDialog({
            kind: "open-with",
            paths: entries.map((entry) => entry.path),
            dirPath: activePane(panes).cwd,
          });
          break;
        }
        case "history-back":
          void panes.goBack();
          break;
        case "history-forward":
          void panes.goForward();
          break;
        case "tab-next":
          panes.cycleTab(1);
          break;
        case "tab-prev":
          panes.cycleTab(-1);
          break;
        case "edit-path":
          ui.setPathEditing(true);
          break;
        case "fuzzy-jump":
          ui.setPaletteOpen(true);
          break;
        case "go-home":
          void getHomePath().then((home) => panes.navigate(home));
          break;
        case "compress":
          void compressSelection();
          break;
        case "start-filter":
          ui.setMode("filter");
          break;
        case "visual-start":
          panes.setVisualAnchor(activePane(panes).cursor);
          ui.setMode("visual");
          break;
        case "visual-exit":
          panes.setVisualAnchor(null);
          ui.setMode("normal");
          break;
        case "toggle-mark":
          panes.toggleMark();
          break;
        case "yank":
          yankOrCut(false);
          break;
        case "cut":
          yankOrCut(true);
          break;
        case "paste":
          void paste();
          break;
        case "trash":
          requestTrash();
          break;
        case "rename":
          requestRename();
          break;
        case "mkdir":
          requestMkdir();
          break;
        case "cancel-task":
          cancelActiveTask();
          break;
        case "clear-register":
          clearRegister();
          break;
        case "toggle-dual":
          panes.toggleDual();
          break;
        case "switch-pane":
          panes.switchPane();
          break;
        case "focus-left":
          panes.setActive(0);
          break;
        case "focus-right":
          panes.setActive(panes.panes.length - 1);
          break;
        case "toggle-preview":
          ui.togglePreview();
          break;
        case "open-settings":
          ui.setSettingsOpen(true);
          break;
        case "escape": {
          const pane = activePane(panes);
          if (pane.marked.size > 0) {
            panes.clearMarks();
          } else if (pane.filter) {
            panes.clearFilter();
          } else {
            void invoke("hide_panel");
          }
          break;
        }
      }
    };
    const onPending = (pending: string) => {
      useUiStore.getState().setPending(pending);
    };
    const { overrides, preset } = useKeymapStore.getState();
    const bindings = presetBindings(preset);
    setEngines({
      normal: createKeyEngine(applyOverrides(bindings.normal, overrides), dispatch, onPending),
      visual: createKeyEngine(applyOverrides(bindings.visual, overrides), dispatch, onPending),
    });
  }, [keymapVersion]);

  useEffect(() => {
    void getHomePath().then((home) => {
      void usePanesStore.getState().navigate(home);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = enginesRef.current;
      if (!current) return;
      const ui = useUiStore.getState();
      if (
        ui.dialog ||
        ui.inputPrompt ||
        ui.settingsOpen ||
        ui.contextMenu ||
        ui.pathEditing ||
        ui.paletteOpen
      ) {
        return;
      }
      if (modeRef.current === "filter") return;
      const engine = modeRef.current === "visual" ? current.visual : current.normal;
      engine.handleKeyDown(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const unlisteners = [
      listen<string>("dir-changed", (event) => {
        void usePanesStore.getState().refreshByPath(event.payload);
      }),
      listen("panel-hidden", () => {
        enginesRef.current?.normal.reset();
        enginesRef.current?.visual.reset();
        usePanesStore.getState().setVisualAnchor(null);
        useUiStore.getState().setMode("normal");
        suspendWatchers();
      }),
      listen("panel-shown", () => {
        if (resumeWatchers()) {
          refreshAllPanes();
        }
      }),
      listen("open-settings", () => {
        useUiStore.getState().setSettingsOpen(true);
      }),
      listen<{ taskId: number; done: number; total: number; current: string }>(
        "task-progress",
        (event) => {
          useTasksStore.getState().patch(event.payload.taskId, {
            done: event.payload.done,
            total: event.payload.total,
            current: event.payload.current,
          });
        },
      ),
      listen<{ taskId: number; cancelled: boolean; results?: TransferResult[] }>(
        "task-done",
        (event) => {
          useTasksStore.getState().remove(event.payload.taskId);
          if (event.payload.cancelled) {
            useUiStore.getState().setToast("処理を中止しました");
            discardJournal(event.payload.taskId);
          } else {
            commitJournal(event.payload.taskId, event.payload.results ?? []);
          }
          resolveTask(event.payload.taskId, { ok: true });
          refreshAllPanes();
        },
      ),
      listen<{ taskId: number; message: string }>("task-error", (event) => {
        useTasksStore.getState().remove(event.payload.taskId);
        useUiStore.getState().setToast(event.payload.message);
        discardJournal(event.payload.taskId);
        resolveTask(event.payload.taskId, { ok: false, message: event.payload.message });
        refreshAllPanes();
      }),
      listen<{ taskId: number; message: string }>("task-note", (event) => {
        useUiStore.getState().setToast(event.payload.message);
      }),
    ];
    return () => {
      for (const unlisten of unlisteners) {
        unlisten.then((fn) => fn());
      }
    };
  }, []);

  useEffect(() => {
    const unlisten = setupDragDrop();
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      useUiStore.getState().setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="file-manager">
      <TabStrip />
      {mode === "filter" && <FilterInput />}
      <div className="main-row">
        <div className="pane-container">
          <DirPane
            paneIndex={0}
            style={
              paneCount > 1
                ? { flex: `0 0 calc(${paneRatio * 100}% - 3px)` }
                : undefined
            }
          />
          {paneCount > 1 && <PaneDivider />}
          {paneCount > 1 && <DirPane paneIndex={1} />}
        </div>
        {previewShown && <PreviewDivider />}
        <PreviewPane />
      </div>
      <CommandLine />
      <StatusBar />
      <Dialogs />
      <SettingsView />
      <ContextMenu />
    </div>
  );
}
