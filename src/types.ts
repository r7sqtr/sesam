export interface Entry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  isHidden: boolean;
  size: number;
  mtimeMs: number;
  ext: string;
}

export interface DirListing {
  entries: Entry[];
  truncated: boolean;
}

export type SortMode = "name" | "mtime" | "size";

export type UiMode = "normal" | "filter" | "visual";

export type ConflictPolicy = "overwrite" | "skip" | "rename";

export interface TaskInfo {
  id: number;
  kind: "copy" | "move" | "zip" | "extract";
  done: number;
  total: number;
  current: string;
}

export interface Register {
  paths: string[];
  isCut: boolean;
}
