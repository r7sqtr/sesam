import { invoke } from "@tauri-apps/api/core";

let fullConfig: Record<string, unknown> = {};
let loading: Promise<void> | null = null;

export function ensureConfigLoaded(): Promise<void> {
  if (!loading) {
    loading = invoke<Record<string, unknown> | null>("load_config")
      .then((config) => {
        if (config && typeof config === "object") {
          fullConfig = config;
        }
      })
      .catch(() => {});
  }
  return loading;
}

export function getConfigSection<T>(key: string): T | undefined {
  return fullConfig[key] as T | undefined;
}

export async function setConfigSection(key: string, value: unknown): Promise<void> {
  fullConfig = { ...fullConfig, [key]: value };
  await invoke("save_config", { config: fullConfig });
}
