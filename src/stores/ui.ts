import { create } from "zustand";
import { setConfigSection } from "./config";
import type { UiMode } from "../types";

function applyOpacity(value: number) {
  document.documentElement.style.setProperty("--shell-alpha", String(value));
}

let opacitySaveTimer: ReturnType<typeof setTimeout> | null = null;

export type DialogState =
  | { kind: "trash"; paths: string[]; names: string[] }
  | { kind: "conflict"; conflicts: string[] }
  | { kind: "sort" }
  | { kind: "open-with"; paths: string[]; dirPath: string }
  | null;

export type InputPrompt =
  | { kind: "rename"; path: string; initial: string }
  | { kind: "mkdir" }
  | null;

interface UiState {
  mode: UiMode;
  pending: string;
  pinned: boolean;
  dialog: DialogState;
  inputPrompt: InputPrompt;
  toast: string | null;
  dropTargetPath: string | null;
  contextMenu: { x: number; y: number; entryPath: string | null } | null;
  setContextMenu: (menu: { x: number; y: number; entryPath: string | null } | null) => void;
  previewVisible: boolean;
  togglePreview: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  pathEditing: boolean;
  setPathEditing: (editing: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  opacity: number;
  setOpacity: (value: number, persist?: boolean) => void;
  paneRatio: number;
  setPaneRatio: (ratio: number) => void;
  previewWidth: number;
  setPreviewWidth: (width: number) => void;
  setMode: (mode: UiMode) => void;
  setPending: (pending: string) => void;
  setPinned: (pinned: boolean) => void;
  setDialog: (dialog: DialogState) => void;
  setInputPrompt: (inputPrompt: InputPrompt) => void;
  setToast: (toast: string | null) => void;
  setDropTargetPath: (path: string | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  mode: "normal",
  pending: "",
  pinned: false,
  dialog: null,
  inputPrompt: null,
  toast: null,
  dropTargetPath: null,
  contextMenu: null,
  setContextMenu: (menu) => set({ contextMenu: menu }),
  previewVisible: true,
  togglePreview: () => set({ previewVisible: !get().previewVisible }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  pathEditing: false,
  setPathEditing: (editing) => set({ pathEditing: editing }),
  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  opacity: 0.5,
  setOpacity: (value, persist = false) => {
    const clamped = Math.min(1, Math.max(0.2, value));
    applyOpacity(clamped);
    set({ opacity: clamped });
    if (persist) {
      if (opacitySaveTimer) clearTimeout(opacitySaveTimer);
      opacitySaveTimer = setTimeout(() => {
        void setConfigSection("opacity", clamped);
      }, 300);
    }
  },
  paneRatio: 0.5,
  setPaneRatio: (ratio) => set({ paneRatio: Math.min(0.8, Math.max(0.2, ratio)) }),
  previewWidth: 340,
  setPreviewWidth: (width) => set({ previewWidth: Math.min(720, Math.max(220, width)) }),
  setMode: (mode) => set({ mode }),
  setPending: (pending) => set({ pending }),
  setPinned: (pinned) => set({ pinned }),
  setDialog: (dialog) => set({ dialog }),
  setInputPrompt: (inputPrompt) => set({ inputPrompt }),
  setToast: (toast) => set({ toast }),
  setDropTargetPath: (path) => {
    if (get().dropTargetPath !== path) {
      set({ dropTargetPath: path });
    }
  },
}));
