import { create } from "zustand";
import { ensureConfigLoaded, getConfigSection, setConfigSection } from "../stores/config";
import { presetBindings, type Action, type KeymapPreset } from "./bindings";

type KeymapOverrides = Partial<Record<Action, string[]>>;

interface KeymapState {
  overrides: KeymapOverrides;
  preset: KeymapPreset;
  version: number;
  loaded: boolean;
  load: () => Promise<void>;
  setOverride: (action: Action, seqs: string[]) => Promise<void>;
  resetOverride: (action: Action) => Promise<void>;
  setPreset: (preset: KeymapPreset) => Promise<void>;
}

export function seqLabelFor(action: Action): string | null {
  const { overrides, preset } = useKeymapStore.getState();
  const override = overrides[action];
  if (override && override.length > 0) return override[0];
  const binding = presetBindings(preset).normal.find((item) => item.action === action);
  return binding ? binding.seq.join(" ") : null;
}

export const useKeymapStore = create<KeymapState>((set, get) => ({
  overrides: {},
  preset: "vim",
  version: 0,
  loaded: false,

  load: async () => {
    await ensureConfigLoaded();
    const keymap = getConfigSection<KeymapOverrides>("keymap");
    if (keymap && typeof keymap === "object") {
      set({ overrides: keymap });
    }
    const preset = getConfigSection<KeymapPreset>("keymapPreset");
    if (preset === "vim" || preset === "standard") {
      set({ preset });
    }
    set({ loaded: true, version: get().version + 1 });
  },

  setPreset: async (preset) => {
    set({ preset, version: get().version + 1 });
    await setConfigSection("keymapPreset", preset);
  },

  setOverride: async (action, seqs) => {
    const overrides = { ...get().overrides, [action]: seqs };
    set({ overrides, version: get().version + 1 });
    await setConfigSection("keymap", overrides);
  },

  resetOverride: async (action) => {
    const overrides = { ...get().overrides };
    delete overrides[action];
    set({ overrides, version: get().version + 1 });
    await setConfigSection("keymap", overrides);
  },
}));
