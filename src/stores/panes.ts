import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { DirListing, Entry, SortMode } from "../types";

export interface PaneData {
  cwd: string;
  entries: Entry[];
  visible: Entry[];
  cursor: number;
  sort: SortMode;
  sortDesc: boolean;
  showHidden: boolean;
  filter: string;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  marked: Set<string>;
  visualAnchor: number | null;
  backStack: string[];
  fwdStack: string[];
}

function emptyPane(): PaneData {
  return {
    cwd: "",
    entries: [],
    visible: [],
    cursor: 0,
    sort: "name",
    sortDesc: false,
    showHidden: false,
    filter: "",
    loading: false,
    error: null,
    truncated: false,
    marked: new Set<string>(),
    visualAnchor: null,
    backStack: [],
    fwdStack: [],
  };
}

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareEntries(a: Entry, b: Entry, sort: SortMode, desc: boolean): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  let result: number;
  switch (sort) {
    case "mtime":
      result = a.mtimeMs - b.mtimeMs;
      break;
    case "size":
      result = a.size - b.size;
      break;
    default:
      result = nameCollator.compare(a.name, b.name);
  }
  return desc ? -result : result;
}

function sortEntries(entries: Entry[], sort: SortMode, sortDesc: boolean): Entry[] {
  return [...entries].sort((a, b) => compareEntries(a, b, sort, sortDesc));
}

function filterEntries(entries: Entry[], showHidden: boolean, filter: string): Entry[] {
  const lower = filter.toLowerCase();
  if (showHidden && !lower) return entries;
  return entries.filter(
    (entry) =>
      (showHidden || !entry.isHidden) &&
      (!lower || entry.name.toLowerCase().includes(lower)),
  );
}

const watchCounts = new Map<string, number>();

let watchersSuspended = false;

function watchPath(path: string) {
  if (!path) return;
  const count = watchCounts.get(path) ?? 0;
  watchCounts.set(path, count + 1);
  if (count === 0 && !watchersSuspended) {
    invoke("watch_dir", { path }).catch(() => {});
  }
}

function unwatchPath(path: string) {
  if (!path) return;
  const count = watchCounts.get(path) ?? 0;
  if (count <= 1) {
    watchCounts.delete(path);
    if (!watchersSuspended) {
      invoke("unwatch_dir", { path }).catch(() => {});
    }
  } else {
    watchCounts.set(path, count - 1);
  }
}

export function suspendWatchers() {
  if (watchersSuspended) return;
  watchersSuspended = true;
  for (const path of watchCounts.keys()) {
    invoke("unwatch_dir", { path }).catch(() => {});
  }
}

/**
 * 監視を再開する。実際に再開した場合のみ true を返す。
 */
export function resumeWatchers(): boolean {
  if (!watchersSuspended) return false;
  watchersSuspended = false;
  for (const path of watchCounts.keys()) {
    invoke("watch_dir", { path }).catch(() => {});
  }
  return true;
}

export interface TabSnapshot {
  panes: PaneData[];
  active: number;
}

interface PanesState {
  panes: PaneData[];
  active: number;
  tabs: TabSnapshot[];
  activeTab: number;
  pageSize: number;
  newTab: () => void;
  switchTab: (index: number) => void;
  closeTab: (index: number) => void;
  cycleTab: (delta: number) => void;
  moveTab: (from: number, to: number) => void;
  navigate: (path: string, paneIndex?: number) => Promise<void>;
  refreshPane: (paneIndex: number) => Promise<void>;
  refreshByPath: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  toggleDual: () => void;
  switchPane: () => void;
  setActive: (index: number) => void;
  moveCursor: (delta: number) => void;
  cursorTo: (index: number) => void;
  cursorToPath: (path: string) => void;
  enter: () => void;
  parent: () => void;
  toggleHidden: () => void;
  setSort: (mode: SortMode, desc: boolean) => void;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  setFilter: (filter: string) => void;
  clearFilter: () => void;
  toggleMark: () => void;
  setMarked: (paneIndex: number, paths: string[]) => void;
  clearMarks: () => void;
  setVisualAnchor: (index: number | null) => void;
  setPageSize: (size: number) => void;
}

export function activePane(state: PanesState): PaneData {
  return state.panes[state.active];
}

export const usePanesStore = create<PanesState>((set, get) => {
  const listGeneration: number[] = [];

  const setPane = (index: number, patch: Partial<PaneData>) => {
    set((state) => ({
      panes: state.panes.map((pane, i) => (i === index ? { ...pane, ...patch } : pane)),
    }));
  };

  const listInto = async (index: number, path: string, keepCursorPath?: string) => {
    const pane = get().panes[index];
    if (!pane) return;
    const generation = (listGeneration[index] = (listGeneration[index] ?? 0) + 1);
    try {
      const listing = await invoke<DirListing>("list_dir", { path });
      if (listGeneration[index] !== generation) return;
      const current = get().panes[index];
      if (!current) return;
      const isSamePath = current.cwd === path;
      const filter = isSamePath ? current.filter : "";
      const sortedEntries = sortEntries(listing.entries, current.sort, current.sortDesc);
      const nextVisible = filterEntries(sortedEntries, current.showHidden, filter);
      let cursor = 0;
      if (keepCursorPath) {
        const found = nextVisible.findIndex((entry) => entry.path === keepCursorPath);
        cursor = found >= 0 ? found : Math.min(current.cursor, Math.max(0, nextVisible.length - 1));
      }
      setPane(index, {
        cwd: path,
        entries: sortedEntries,
        visible: nextVisible,
        cursor,
        filter,
        truncated: listing.truncated,
        loading: false,
        error: null,
        ...(isSamePath ? {} : { marked: new Set<string>(), visualAnchor: null }),
      });
    } catch (error) {
      if (listGeneration[index] !== generation) return;
      setPane(index, { loading: false, error: String(error) });
    }
  };

  const snapshotCurrent = (): TabSnapshot => ({
    panes: get().panes,
    active: get().active,
  });

  return {
    panes: [emptyPane()],
    active: 0,
    tabs: [{ panes: [emptyPane()], active: 0 }],
    activeTab: 0,
    pageSize: 20,

    newTab: () => {
      const { tabs, activeTab, panes, active } = get();
      const source = panes[active];
      const fresh: PaneData = {
        ...emptyPane(),
        cwd: source.cwd,
        entries: source.entries,
        visible: source.visible,
        sort: source.sort,
        sortDesc: source.sortDesc,
        showHidden: source.showHidden,
      };
      const nextTabs = [...tabs];
      nextTabs[activeTab] = snapshotCurrent();
      nextTabs.push({ panes: [fresh], active: 0 });
      panes.forEach((pane) => unwatchPath(pane.cwd));
      watchPath(fresh.cwd);
      set({
        tabs: nextTabs,
        activeTab: nextTabs.length - 1,
        panes: [fresh],
        active: 0,
      });
    },

    switchTab: (index: number) => {
      const { tabs, activeTab, panes } = get();
      if (index === activeTab || !tabs[index]) return;
      const nextTabs = [...tabs];
      nextTabs[activeTab] = snapshotCurrent();
      const target = nextTabs[index];
      panes.forEach((pane) => unwatchPath(pane.cwd));
      target.panes.forEach((pane) => watchPath(pane.cwd));
      set({
        tabs: nextTabs,
        activeTab: index,
        panes: target.panes,
        active: target.active,
      });
      target.panes.forEach((_, paneIndex) => {
        void get().refreshPane(paneIndex);
      });
    },

    closeTab: (index: number) => {
      const { tabs, activeTab } = get();
      if (tabs.length <= 1 || !tabs[index]) return;
      if (index === activeTab) {
        const fallback = index > 0 ? index - 1 : 1;
        get().switchTab(fallback);
        const after = get();
        const nextTabs = after.tabs.filter((_, i) => i !== index);
        set({
          tabs: nextTabs,
          activeTab: after.activeTab > index ? after.activeTab - 1 : after.activeTab,
        });
      } else {
        const nextTabs = tabs.filter((_, i) => i !== index);
        set({
          tabs: nextTabs,
          activeTab: activeTab > index ? activeTab - 1 : activeTab,
        });
      }
    },

    cycleTab: (delta: number) => {
      const { tabs, activeTab } = get();
      if (tabs.length <= 1) return;
      const next = (activeTab + delta + tabs.length) % tabs.length;
      get().switchTab(next);
    },

    moveTab: (from: number, to: number) => {
      const { tabs, activeTab, panes, active } = get();
      if (from === to || !tabs[from] || to < 0 || to >= tabs.length) return;
      const nextTabs = [...tabs];
      nextTabs[activeTab] = { panes, active };
      const [moved] = nextTabs.splice(from, 1);
      nextTabs.splice(to, 0, moved);
      let nextActive = activeTab;
      if (activeTab === from) {
        nextActive = to;
      } else if (from < activeTab && to >= activeTab) {
        nextActive = activeTab - 1;
      } else if (from > activeTab && to <= activeTab) {
        nextActive = activeTab + 1;
      }
      set({ tabs: nextTabs, activeTab: nextActive });
    },

    navigate: async (path: string, paneIndex?: number) => {
      const index = paneIndex ?? get().active;
      const previous = get().panes[index]?.cwd ?? "";
      setPane(index, { loading: true });
      await listInto(index, path);
      const landed = get().panes[index];
      if (landed && landed.cwd === path && previous !== path) {
        if (previous) {
          setPane(index, {
            backStack: [...landed.backStack, previous],
            fwdStack: [],
          });
        }
        unwatchPath(previous);
        watchPath(path);
        invoke("record_visit", { path }).catch(() => {});
      }
    },

    goBack: async () => {
      const index = get().active;
      const pane = get().panes[index];
      const target = pane?.backStack[pane.backStack.length - 1];
      if (!pane || !target) return;
      const current = pane.cwd;
      setPane(index, {
        backStack: pane.backStack.slice(0, -1),
        fwdStack: [...pane.fwdStack, current],
        loading: true,
      });
      await listInto(index, target);
      if (get().panes[index]?.cwd === target) {
        unwatchPath(current);
        watchPath(target);
        invoke("record_visit", { path: target }).catch(() => {});
      }
    },

    goForward: async () => {
      const index = get().active;
      const pane = get().panes[index];
      const target = pane?.fwdStack[pane.fwdStack.length - 1];
      if (!pane || !target) return;
      const current = pane.cwd;
      setPane(index, {
        fwdStack: pane.fwdStack.slice(0, -1),
        backStack: [...pane.backStack, current],
        loading: true,
      });
      await listInto(index, target);
      if (get().panes[index]?.cwd === target) {
        unwatchPath(current);
        watchPath(target);
        invoke("record_visit", { path: target }).catch(() => {});
      }
    },

    refreshPane: async (paneIndex: number) => {
      const pane = get().panes[paneIndex];
      if (!pane || !pane.cwd) return;
      const cursorPath = pane.visible[pane.cursor]?.path;
      await listInto(paneIndex, pane.cwd, cursorPath);
    },

    refreshByPath: async (path: string) => {
      const { panes, refreshPane } = get();
      for (let i = 0; i < panes.length; i += 1) {
        if (panes[i].cwd === path) {
          await refreshPane(i);
        }
      }
    },

    refresh: async () => {
      await get().refreshPane(get().active);
    },

    toggleDual: () => {
      const { panes, active } = get();
      if (panes.length === 1) {
        const source = panes[0];
        const clone: PaneData = {
          ...source,
          marked: new Set<string>(),
          visualAnchor: null,
        };
        watchPath(source.cwd);
        set({ panes: [source, clone], active: 0 });
      } else {
        const keep = panes[active];
        const drop = panes[active === 0 ? 1 : 0];
        unwatchPath(drop.cwd);
        set({ panes: [keep], active: 0 });
      }
    },

    switchPane: () => {
      const { panes, active } = get();
      if (panes.length < 2) return;
      set({ active: (active + 1) % panes.length });
    },

    setActive: (index: number) => {
      if (index >= 0 && index < get().panes.length) {
        set({ active: index });
      }
    },

    moveCursor: (delta: number) => {
      const { active } = get();
      const pane = activePane(get());
      if (pane.visible.length === 0) return;
      setPane(active, {
        cursor: Math.min(Math.max(pane.cursor + delta, 0), pane.visible.length - 1),
      });
    },

    cursorTo: (index: number) => {
      const { active } = get();
      const pane = activePane(get());
      if (pane.visible.length === 0) return;
      setPane(active, {
        cursor: Math.min(Math.max(index, 0), pane.visible.length - 1),
      });
    },

    cursorToPath: (path: string) => {
      const { panes } = get();
      for (let i = 0; i < panes.length; i += 1) {
        const index = panes[i].visible.findIndex((entry) => entry.path === path);
        if (index >= 0) {
          setPane(i, { cursor: index });
        }
      }
    },

    enter: () => {
      const pane = activePane(get());
      const entry = pane.visible[pane.cursor];
      if (!entry) return;
      if (entry.isDir) {
        void get().navigate(entry.path);
      } else {
        invoke("open_entries", { paths: [entry.path] }).catch(() => {});
      }
    },

    parent: () => {
      const pane = activePane(get());
      if (!pane.cwd || pane.cwd === "/") return;
      const index = pane.cwd.lastIndexOf("/");
      void get().navigate(index <= 0 ? "/" : pane.cwd.slice(0, index));
    },

    toggleHidden: () => {
      const { active } = get();
      const pane = activePane(get());
      const next = !pane.showHidden;
      setPane(active, {
        showHidden: next,
        visible: filterEntries(pane.entries, next, pane.filter),
        cursor: 0,
      });
    },

    setSort: (mode: SortMode, desc: boolean) => {
      const { active } = get();
      const pane = activePane(get());
      const sortedEntries = sortEntries(pane.entries, mode, desc);
      setPane(active, {
        sort: mode,
        sortDesc: desc,
        entries: sortedEntries,
        visible: filterEntries(sortedEntries, pane.showHidden, pane.filter),
        cursor: 0,
      });
    },

    setFilter: (filter: string) => {
      const { active } = get();
      const pane = activePane(get());
      setPane(active, {
        filter,
        visible: filterEntries(pane.entries, pane.showHidden, filter),
        cursor: 0,
      });
    },

    clearFilter: () => {
      const { active } = get();
      const pane = activePane(get());
      setPane(active, {
        filter: "",
        visible: filterEntries(pane.entries, pane.showHidden, ""),
        cursor: 0,
      });
    },

    toggleMark: () => {
      const { active } = get();
      const pane = activePane(get());
      const entry = pane.visible[pane.cursor];
      if (!entry) return;
      const next = new Set(pane.marked);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
      }
      setPane(active, {
        marked: next,
        cursor: Math.min(pane.cursor + 1, pane.visible.length - 1),
      });
    },

    setMarked: (paneIndex: number, paths: string[]) => {
      setPane(paneIndex, { marked: new Set(paths) });
    },

    clearMarks: () => {
      setPane(get().active, { marked: new Set<string>() });
    },

    setVisualAnchor: (index: number | null) => {
      setPane(get().active, { visualAnchor: index });
    },

    setPageSize: (size: number) => {
      set({ pageSize: Math.max(1, size) });
    },
  };
});
