import { invoke } from "@tauri-apps/api/core";
import { activePane, usePanesStore } from "./stores/panes";
import { useUiStore } from "./stores/ui";
import { useRegisterStore } from "./stores/register";
import { useTasksStore } from "./stores/tasks";
import { setPendingJournal } from "./undo";
import type { ConflictPolicy, Entry } from "./types";

export function selectionEntries(): Entry[] {
  const { visible, cursor, marked, visualAnchor } = activePane(usePanesStore.getState());
  if (visualAnchor !== null && visible.length > 0) {
    const start = Math.min(visualAnchor, cursor);
    const end = Math.max(visualAnchor, cursor);
    return visible.slice(start, end + 1);
  }
  if (marked.size > 0) {
    return visible.filter((entry) => marked.has(entry.path));
  }
  const entry = visible[cursor];
  return entry ? [entry] : [];
}

function exitSelection() {
  const panes = usePanesStore.getState();
  panes.setVisualAnchor(null);
  panes.clearMarks();
  useUiStore.getState().setMode("normal");
}

export function yankOrCut(isCut: boolean) {
  const entries = selectionEntries();
  if (entries.length === 0) return;
  useRegisterStore.getState().setRegister({
    paths: entries.map((entry) => entry.path),
    isCut,
  });
  exitSelection();
  useUiStore
    .getState()
    .setToast(`${entries.length}件を${isCut ? "カット" : "ヤンク"}しました`);
}

interface PendingTransfer {
  sources: string[];
  destDir: string;
  move: boolean;
  fromRegister: boolean;
}

let pendingTransfer: PendingTransfer | null = null;

export async function beginTransfer(
  sources: string[],
  destDir: string,
  move: boolean,
  fromRegister = false,
) {
  for (const source of sources) {
    if (destDir === source || destDir.startsWith(`${source}/`)) {
      useUiStore.getState().setToast("コピー/移動先がソース自身またはその内部です");
      return;
    }
  }
  pendingTransfer = { sources, destDir, move, fromRegister };
  try {
    const conflicts = await invoke<string[]>("check_conflicts", {
      sources,
      destDir,
    });
    if (conflicts.length > 0) {
      useUiStore.getState().setDialog({ kind: "conflict", conflicts });
      return;
    }
    await runTransfer("skip", true);
  } catch (error) {
    pendingTransfer = null;
    useUiStore.getState().setToast(String(error));
  }
}

export async function runTransfer(policy: ConflictPolicy, journal = false) {
  const pending = pendingTransfer;
  pendingTransfer = null;
  if (!pending) return;
  const command = pending.move ? "move_entries" : "copy_entries";
  try {
    const taskId = await invoke<number>(command, {
      sources: pending.sources,
      destDir: pending.destDir,
      onConflict: policy,
    });
    useTasksStore.getState().upsert({
      id: taskId,
      kind: pending.move ? "move" : "copy",
      done: 0,
      total: 0,
      current: "",
    });
    if (journal) {
      setPendingJournal(taskId, { kind: pending.move ? "move" : "copy" });
    }
    if (pending.move && pending.fromRegister) {
      useRegisterStore.getState().setRegister(null);
    }
  } catch (error) {
    useUiStore.getState().setToast(String(error));
  }
}

export function cancelPendingTransfer() {
  pendingTransfer = null;
}

export async function paste() {
  const { register } = useRegisterStore.getState();
  if (!register || register.paths.length === 0) return;
  await beginTransfer(
    register.paths,
    activePane(usePanesStore.getState()).cwd,
    register.isCut,
    true,
  );
}

export function requestTrash() {
  const entries = selectionEntries();
  if (entries.length === 0) return;
  useUiStore.getState().setDialog({
    kind: "trash",
    paths: entries.map((entry) => entry.path),
    names: entries.map((entry) => entry.name),
  });
}

export async function confirmTrash(paths: string[]) {
  try {
    await invoke("trash_entries", { paths });
    exitSelection();
    useUiStore.getState().setToast(`${paths.length}件をゴミ箱へ移動しました`);
    await usePanesStore.getState().refresh();
  } catch (error) {
    useUiStore.getState().setToast(String(error));
  }
}

export function requestRename() {
  const { visible, cursor } = activePane(usePanesStore.getState());
  const entry = visible[cursor];
  if (!entry) return;
  useUiStore.getState().setInputPrompt({
    kind: "rename",
    path: entry.path,
    initial: entry.name,
  });
}

export function requestMkdir() {
  useUiStore.getState().setInputPrompt({ kind: "mkdir" });
}

export async function compressSelection() {
  const entries = selectionEntries();
  if (entries.length === 0) return;
  const destDir = activePane(usePanesStore.getState()).cwd;
  try {
    const taskId = await invoke<number>("create_zip", {
      sources: entries.map((entry) => entry.path),
      destDir,
    });
    useTasksStore.getState().upsert({
      id: taskId,
      kind: "zip",
      done: 0,
      total: 0,
      current: "",
    });
  } catch (error) {
    useUiStore.getState().setToast(String(error));
  }
}

export async function extractArchive(archive: string) {
  const destDir = activePane(usePanesStore.getState()).cwd;
  try {
    const taskId = await invoke<number>("extract_archive", {
      archive,
      destDir,
    });
    useTasksStore.getState().upsert({
      id: taskId,
      kind: "extract",
      done: 0,
      total: 0,
      current: "",
    });
  } catch (error) {
    useUiStore.getState().setToast(String(error));
  }
}

export function clearRegister() {
  const { register, setRegister } = useRegisterStore.getState();
  if (!register) return;
  setRegister(null);
  useUiStore
    .getState()
    .setToast(`${register.isCut ? "カット" : "ヤンク"}を取り消しました`);
}

export function cancelActiveTask() {
  const { tasks } = useTasksStore.getState();
  const task = tasks[0];
  if (task) {
    void invoke("cancel_task", { taskId: task.id });
  }
}
