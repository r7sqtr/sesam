import { homeDir } from "@tauri-apps/api/path";
import { ensureConfigLoaded, getConfigSection } from "../stores/config";

export async function getHomePath(): Promise<string> {
  await ensureConfigLoaded();
  const configured = getConfigSection<string>("homePath");
  const system = (await homeDir()).replace(/\/$/, "");
  if (configured && configured.trim()) {
    let path = configured.trim();
    if (path.startsWith("~")) {
      path = system + path.slice(1);
    }
    if (path !== "/" && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return path || "/";
  }
  return system;
}
