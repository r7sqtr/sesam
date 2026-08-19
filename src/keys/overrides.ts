import type { Binding } from "./engine";
import type { Action } from "./bindings";

export function applyOverrides(
  bindings: Binding<Action>[],
  keymap: Partial<Record<string, string[]>>,
): Binding<Action>[] {
  let result = bindings;
  for (const [action, seqs] of Object.entries(keymap)) {
    if (!Array.isArray(seqs)) continue;
    if (!result.some((binding) => binding.action === action)) continue;
    result = result.filter((binding) => binding.action !== action);
    for (const seq of seqs) {
      if (typeof seq !== "string" || seq.trim() === "") continue;
      result = [...result, { action: action as Action, seq: seq.trim().split(/\s+/) }];
    }
  }
  return result;
}
