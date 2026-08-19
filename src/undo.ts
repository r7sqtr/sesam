import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "./stores/ui";
import { usePanesStore } from "./stores/panes";
import { parentPath } from "./lib/path";
import { awaitTask } from "./taskWait";

interface TransferItem {
  from: string;
  to: string;
}

export type UndoOp =
  | { kind: "rename"; from: string; to: string }
  | { kind: "mkdir"; path: string }
  | { kind: "move"; items: TransferItem[] }
  | { kind: "copy"; items: TransferItem[] };

export interface TransferResult {
  source: string;
  dest: string;
}

export interface JournalIntent {
  kind: "move" | "copy";
}

const LIMIT = 20;
const undoStack: UndoOp[] = [];
const redoStack: UndoOp[] = [];
const pendingJournal = new Map<number, JournalIntent>();

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = key(item);
    const existing = map.get(bucket);
    if (existing) {
      existing.push(item);
    } else {
      map.set(bucket, [item]);
    }
  }
  return map;
}

export function recordOp(op: UndoOp) {
  undoStack.push(op);
  if (undoStack.length > LIMIT) {
    undoStack.shift();
  }
  redoStack.length = 0;
}

export function setPendingJournal(taskId: number, intent: JournalIntent) {
  pendingJournal.set(taskId, intent);
}

export function commitJournal(taskId: number, results: TransferResult[]) {
  const intent = pendingJournal.get(taskId);
  pendingJournal.delete(taskId);
  if (!intent || results.length === 0) return;
  const items = results.map((result) => ({ from: result.source, to: result.dest }));
  recordOp({ kind: intent.kind, items });
}

export function discardJournal(taskId: number) {
  pendingJournal.delete(taskId);
}

function refreshAll() {
  const state = usePanesStore.getState();
  state.panes.forEach((_, index) => {
    void state.refreshPane(index);
  });
}

async function moveGrouped(
  items: TransferItem[],
  sourceOf: (item: TransferItem) => string,
  destOf: (item: TransferItem) => string,
) {
  const groups = groupBy(items, destOf);
  for (const [destDir, groupItems] of groups) {
    const taskId = await invoke<number>("move_entries", {
      sources: groupItems.map(sourceOf),
      destDir,
      onConflict: "rename",
    });
    await awaitTask(taskId);
  }
}

export async function undo() {
  const toast = useUiStore.getState().setToast;
  const op = undoStack.pop();
  if (!op) {
    toast("取り消せる操作がありません");
    return;
  }
  try {
    switch (op.kind) {
      case "rename":
        await invoke("rename_entry", { path: op.to, newName: basename(op.from) });
        toast("リネームを取り消しました");
        break;
      case "mkdir":
        await invoke("remove_empty_dir", { path: op.path });
        toast("フォルダ作成を取り消しました");
        break;
      case "move":
        await moveGrouped(
          op.items,
          (item) => item.to,
          (item) => parentPath(item.from),
        );
        toast("移動を取り消しました");
        break;
      case "copy":
        await invoke("trash_entries", { paths: op.items.map((item) => item.to) });
        toast("コピーを取り消しました");
        break;
    }
    redoStack.push(op);
    refreshAll();
  } catch (error) {
    undoStack.push(op);
    toast(String(error));
  }
}

export async function redo() {
  const toast = useUiStore.getState().setToast;
  const op = redoStack.pop();
  if (!op) {
    toast("やり直せる操作がありません");
    return;
  }
  try {
    switch (op.kind) {
      case "rename":
        await invoke("rename_entry", { path: op.from, newName: basename(op.to) });
        toast("リネームをやり直しました");
        break;
      case "mkdir":
        await invoke("create_folder", {
          parent: parentPath(op.path),
          name: basename(op.path),
        });
        toast("フォルダ作成をやり直しました");
        break;
      case "move":
        await moveGrouped(
          op.items,
          (item) => item.from,
          (item) => parentPath(item.to),
        );
        toast("移動をやり直しました");
        break;
      case "copy": {
        const groups = groupBy(op.items, (item) => parentPath(item.to));
        for (const [destDir, groupItems] of groups) {
          const taskId = await invoke<number>("copy_entries", {
            sources: groupItems.map((item) => item.from),
            destDir,
            onConflict: "rename",
          });
          await awaitTask(taskId);
        }
        toast("コピーをやり直しました");
        break;
      }
    }
    undoStack.push(op);
    refreshAll();
  } catch (error) {
    redoStack.push(op);
    toast(String(error));
  }
}
