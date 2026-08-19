import { useEffect } from "react";
import { useUiStore } from "../stores/ui";
import { usePanesStore } from "../stores/panes";
import { cancelPendingTransfer, confirmTrash, runTransfer } from "../ops";
import { OpenWithDialog } from "./OpenWithDialog";
import type { ConflictPolicy, SortMode } from "../types";

const SORT_CHOICES: { key: string; label: string; mode: SortMode; desc: boolean }[] = [
  { key: "1", label: "名前（昇順）", mode: "name", desc: false },
  { key: "2", label: "名前（降順）", mode: "name", desc: true },
  { key: "3", label: "更新日時（新しい順）", mode: "mtime", desc: true },
  { key: "4", label: "更新日時（古い順）", mode: "mtime", desc: false },
  { key: "5", label: "サイズ（大きい順）", mode: "size", desc: true },
  { key: "6", label: "サイズ（小さい順）", mode: "size", desc: false },
];

export function Dialogs() {
  const dialog = useUiStore((state) => state.dialog);
  const setDialog = useUiStore((state) => state.setDialog);

  useEffect(() => {
    if (!dialog || dialog.kind === "open-with") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (dialog.kind === "trash") {
        if (event.key === "y" || event.key === "Enter") {
          setDialog(null);
          void confirmTrash(dialog.paths);
        } else if (event.key === "n" || event.key === "Escape") {
          setDialog(null);
        }
      } else if (dialog.kind === "conflict") {
        const pick = (policy: ConflictPolicy) => {
          setDialog(null);
          void runTransfer(policy);
        };
        if (event.key === "o") pick("overwrite");
        else if (event.key === "s") pick("skip");
        else if (event.key === "r") pick("rename");
        else if (event.key === "Escape") {
          cancelPendingTransfer();
          setDialog(null);
        }
      } else if (dialog.kind === "sort") {
        const choice = SORT_CHOICES.find((item) => item.key === event.key);
        if (choice) {
          setDialog(null);
          usePanesStore.getState().setSort(choice.mode, choice.desc);
        } else if (event.key === "Escape") {
          setDialog(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dialog, setDialog]);

  if (!dialog) return null;

  if (dialog.kind === "open-with") {
    return (
      <OpenWithDialog
        paths={dialog.paths}
        dirPath={dialog.dirPath}
        onClose={() => setDialog(null)}
      />
    );
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        {dialog.kind === "trash" ? (
          <>
            <div className="dialog-title">{dialog.paths.length}件をゴミ箱に移動しますか？</div>
            <div className="dialog-body">
              {dialog.names.slice(0, 5).join("、")}
              {dialog.names.length > 5 && ` ほか${dialog.names.length - 5}件`}
            </div>
            <div className="dialog-actions">
              <button
                className="settings-btn danger"
                onClick={() => {
                  setDialog(null);
                  void confirmTrash(dialog.paths);
                }}
              >
                ゴミ箱へ移動 (y)
              </button>
              <button className="settings-btn" onClick={() => setDialog(null)}>
                キャンセル (Esc)
              </button>
            </div>
          </>
        ) : dialog.kind === "conflict" ? (
          <>
            <div className="dialog-title">同名の項目があります（{dialog.conflicts.length}件）</div>
            <div className="dialog-body">
              {dialog.conflicts.slice(0, 5).join("、")}
              {dialog.conflicts.length > 5 && ` ほか${dialog.conflicts.length - 5}件`}
            </div>
            <div className="dialog-actions">
              <button
                className="settings-btn danger"
                onClick={() => {
                  setDialog(null);
                  void runTransfer("overwrite");
                }}
              >
                上書き (o)
              </button>
              <button
                className="settings-btn"
                onClick={() => {
                  setDialog(null);
                  void runTransfer("skip");
                }}
              >
                スキップ (s)
              </button>
              <button
                className="settings-btn"
                onClick={() => {
                  setDialog(null);
                  void runTransfer("rename");
                }}
              >
                別名で保存 (r)
              </button>
              <button
                className="settings-btn"
                onClick={() => {
                  cancelPendingTransfer();
                  setDialog(null);
                }}
              >
                キャンセル (Esc)
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="dialog-title">並び替え</div>
            <div className="menu-list">
              {SORT_CHOICES.map((choice) => (
                <button
                  key={choice.key}
                  className="menu-item clickable"
                  onClick={() => {
                    setDialog(null);
                    usePanesStore.getState().setSort(choice.mode, choice.desc);
                  }}
                >
                  <kbd>{choice.key}</kbd> {choice.label}
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <span>
                <kbd>Esc</kbd> キャンセル
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
