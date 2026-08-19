import { create } from "zustand";
import { homeDir } from "@tauri-apps/api/path";
import { ensureConfigLoaded, getConfigSection, setConfigSection } from "./config";

export interface BookmarkItem {
  name: string;
  path: string;
}

const basename = (path: string) =>
  path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1) || "/";

interface BookmarksState {
  bookmarks: BookmarkItem[];
  loaded: boolean;
  load: () => Promise<void>;
  toggleBookmark: (path: string) => Promise<void>;
  removeBookmark: (path: string) => Promise<void>;
  renameBookmark: (path: string, name: string) => Promise<void>;
}

function normalize(saved: unknown): BookmarkItem[] | null {
  if (Array.isArray(saved)) {
    if (saved.every((item) => typeof item === "string")) {
      return (saved as string[]).map((path) => ({ name: basename(path), path }));
    }
    if (
      saved.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as BookmarkItem).path === "string" &&
          typeof (item as BookmarkItem).name === "string",
      )
    ) {
      return saved as BookmarkItem[];
    }
  }
  if (saved && typeof saved === "object") {
    return Object.values(saved as Record<string, string>)
      .filter((value) => typeof value === "string")
      .map((path) => ({ name: basename(path), path }));
  }
  return null;
}

export const useBookmarksStore = create<BookmarksState>((set, get) => {
  const persist = async (bookmarks: BookmarkItem[]) => {
    set({ bookmarks });
    await setConfigSection("bookmarks", bookmarks);
  };

  return {
    bookmarks: [],
    loaded: false,

    load: async () => {
      await ensureConfigLoaded();
      const saved = normalize(getConfigSection<unknown>("bookmarks"));
      if (saved && saved.length > 0) {
        set({ bookmarks: saved, loaded: true });
        return;
      }
      const home = (await homeDir()).replace(/\/$/, "");
      const defaults: BookmarkItem[] = [
        { name: "ホーム", path: home },
        { name: "ダウンロード", path: `${home}/Downloads` },
        { name: "書類", path: `${home}/Documents` },
        { name: "デスクトップ", path: `${home}/Desktop` },
      ];
      set({ bookmarks: defaults, loaded: true });
      await setConfigSection("bookmarks", defaults);
    },

    toggleBookmark: async (path) => {
      const current = get().bookmarks;
      const exists = current.some((item) => item.path === path);
      const bookmarks = exists
        ? current.filter((item) => item.path !== path)
        : [...current, { name: basename(path), path }];
      await persist(bookmarks);
    },

    removeBookmark: async (path) => {
      await persist(get().bookmarks.filter((item) => item.path !== path));
    },

    renameBookmark: async (path, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await persist(
        get().bookmarks.map((item) =>
          item.path === path ? { ...item, name: trimmed } : item,
        ),
      );
    },
  };
});
