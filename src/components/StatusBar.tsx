import { usePanesStore } from "../stores/panes";
import { useUiStore } from "../stores/ui";
import { useRegisterStore } from "../stores/register";
import { useTasksStore } from "../stores/tasks";
import { seqLabelFor, useKeymapStore } from "../keys/keymapStore";
import type { SortMode } from "../types";

const SORT_LABELS: Record<SortMode, string> = {
  name: "名前",
  mtime: "更新順",
  size: "サイズ",
};

export function StatusBar() {
  const visibleCount = usePanesStore((state) => state.panes[state.active].visible.length);
  const cursor = usePanesStore((state) => state.panes[state.active].cursor);
  const sort = usePanesStore((state) => state.panes[state.active].sort);
  const sortDesc = usePanesStore((state) => state.panes[state.active].sortDesc);
  const showHidden = usePanesStore((state) => state.panes[state.active].showHidden);
  const filter = usePanesStore((state) => state.panes[state.active].filter);
  const markedCount = usePanesStore((state) => state.panes[state.active].marked.size);
  const paneCount = usePanesStore((state) => state.panes.length);
  const activeIndex = usePanesStore((state) => state.active);
  const mode = useUiStore((state) => state.mode);
  const pending = useUiStore((state) => state.pending);
  const toast = useUiStore((state) => state.toast);
  const register = useRegisterStore((state) => state.register);
  const task = useTasksStore((state) => state.tasks[0]);
  useKeymapStore((state) => state.version);
  const clearKey = seqLabelFor("clear-register");
  const cancelKey = seqLabelFor("cancel-task");

  const modeLabel = mode === "filter" ? "FILTER" : mode === "visual" ? "VISUAL" : "NORMAL";

  return (
    <div className="status-bar">
      <span className={`mode-badge ${mode}`}>{modeLabel}</span>
      {paneCount > 1 && (
        <span className="status-item">{activeIndex === 0 ? "LEFT" : "RIGHT"}</span>
      )}
      {pending && <span className="pending-keys">{pending}</span>}
      {filter && mode === "normal" && <span className="filter-chip">/{filter}</span>}
      {markedCount > 0 && <span className="status-item">選択: {markedCount}件</span>}
      {register && (
        <span className="register-chip">
          {register.paths.length}件 {register.isCut ? "カット中" : "ヤンク中"}
          {clearKey && `（${clearKey} で取消）`}
        </span>
      )}
      {task && (
        <span className="task-chip">
          {task.kind === "move"
            ? "移動中"
            : task.kind === "zip"
              ? "圧縮中"
              : task.kind === "extract"
                ? "展開中"
                : "コピー中"}{" "}
          {task.done}/{task.total || "?"}
          {task.current && ` ${task.current}`}
          {cancelKey && `（${cancelKey} で中止）`}
        </span>
      )}
      {toast && <span className="toast">{toast}</span>}
      <span className="status-spacer" />
      <span className="status-item">{visibleCount === 0 ? "0/0" : `${cursor + 1}/${visibleCount}`}</span>
      <span className="status-item">
        並び: {SORT_LABELS[sort]}
        {sortDesc ? "↓" : "↑"}
      </span>
      <span className="status-item">{showHidden ? "隠しファイル: 表示" : "隠しファイル: 非表示"}</span>
    </div>
  );
}
