import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "../stores/ui";
import { useKeymapStore } from "../keys/keymapStore";
import {
  ensureConfigLoaded,
  getConfigSection,
  setConfigSection,
} from "../stores/config";
import {
  ACTION_LABELS,
  PRESET_LABELS,
  presetBindings,
  type Action,
  type KeymapPreset,
} from "../keys/bindings";
import { normalizeKey } from "../keys/engine";

const ALL_ACTIONS = Object.keys(ACTION_LABELS) as Action[];
const PRESETS: KeymapPreset[] = ["vim", "standard"];

function defaultSeqs(action: Action, preset: KeymapPreset): string[] {
  const bindings = presetBindings(preset);
  const seqs = new Set<string>();
  for (const binding of [...bindings.normal, ...bindings.visual]) {
    if (binding.action === action) {
      seqs.add(binding.seq.join(" "));
    }
  }
  return [...seqs];
}

export function SettingsView() {
  const open = useUiStore((state) => state.settingsOpen);
  const setOpen = useUiStore((state) => state.setSettingsOpen);
  const overrides = useKeymapStore((state) => state.overrides);
  const preset = useKeymapStore((state) => state.preset);
  const [recording, setRecording] = useState<Action | null>(null);
  const [recorded, setRecorded] = useState<string[]>([]);
  const [hotkey, setHotkey] = useState("ctrl+p");
  const [hotkeyRecording, setHotkeyRecording] = useState(false);
  const [homePath, setHomePath] = useState("");
  const opacity = useUiStore((state) => state.opacity);

  useEffect(() => {
    if (!open) return;
    void ensureConfigLoaded().then(() => {
      setHotkey(getConfigSection<string>("hotkey") ?? "ctrl+p");
      setHomePath(getConfigSection<string>("homePath") ?? "~");
    });
  }, [open]);

  const commitHomePath = () => {
    const value = homePath.trim() || "~";
    setHomePath(value);
    void setConfigSection("homePath", value);
    useUiStore.getState().setToast(`ホームを ${value} に設定しました`);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (hotkeyRecording) {
        event.preventDefault();
        event.stopPropagation();
        const key = event.key;
        if (key === "Escape") {
          setHotkeyRecording(false);
          return;
        }
        if (key === "Control" || key === "Meta" || key === "Alt" || key === "Shift") {
          return;
        }
        const mods: string[] = [];
        if (event.ctrlKey) mods.push("ctrl");
        if (event.altKey) mods.push("alt");
        if (event.shiftKey) mods.push("shift");
        if (event.metaKey) mods.push("super");
        if (mods.length === 0) {
          useUiStore
            .getState()
            .setToast("グローバルホットキーには修飾キー（Ctrl / ⌘ / Option）が必要です");
          return;
        }
        const keyName = key === " " ? "Space" : key.length === 1 ? key.toLowerCase() : key;
        const shortcut = [...mods, keyName].join("+");
        setHotkeyRecording(false);
        invoke("set_hotkey", { shortcut })
          .then(async () => {
            setHotkey(shortcut);
            await setConfigSection("hotkey", shortcut);
            useUiStore.getState().setToast(`ホットキーを ${shortcut} に変更しました`);
          })
          .catch((error) => {
            useUiStore.getState().setToast(`ホットキーを設定できません: ${error}`);
            void invoke("set_hotkey", { shortcut: hotkey }).catch(() => {});
          });
        return;
      }
      if (recording) {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Enter") {
          if (recorded.length > 0) {
            void useKeymapStore.getState().setOverride(recording, [recorded.join(" ")]);
          }
          setRecording(null);
          setRecorded([]);
        } else if (event.key === "Escape") {
          setRecording(null);
          setRecorded([]);
        } else {
          const token = normalizeKey(event);
          if (token) {
            setRecorded((prev) => [...prev, token]);
          }
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, recording, recorded, hotkeyRecording, hotkey, setOpen]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog settings-dialog">
        <div className="dialog-title">設定</div>
        <div className="settings-section-title">ホットキー</div>
        <div className="settings-row hotkey-row">
          <span className="settings-label">パネルの表示 / 非表示</span>
          <span className={hotkeyRecording ? "settings-keys recording" : "settings-keys"}>
            {hotkeyRecording ? "キーを押してください…" : <kbd>{hotkey}</kbd>}
          </span>
          <button className="settings-btn" onClick={() => setHotkeyRecording(true)}>
            変更
          </button>
        </div>
        <div className="settings-hint">
          Ctrl+英字はターミナルや vim の操作と衝突する場合があります。⌘ / Option 併用も選べます。
        </div>
        <div className="settings-section-title">ホーム</div>
        <div className="settings-row hotkey-row">
          <span className="settings-label">ホームボタンの移動先</span>
          <input
            className="home-input"
            value={homePath}
            spellCheck={false}
            placeholder="~"
            onChange={(event) => setHomePath(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commitHomePath();
              }
            }}
          />
          <button className="settings-btn" onClick={commitHomePath}>
            保存
          </button>
        </div>
        <div className="settings-section-title">外観</div>
        <div className="settings-row hotkey-row">
          <span className="settings-label">背景の透明度</span>
          <input
            type="range"
            className="opacity-slider"
            min={20}
            max={100}
            step={5}
            value={Math.round(opacity * 100)}
            onChange={(event) =>
              useUiStore.getState().setOpacity(Number(event.target.value) / 100, true)
            }
          />
          <span className="settings-keys">{Math.round(opacity * 100)}%</span>
        </div>
        <div className="settings-section-title">キーマップ</div>
        <div className="settings-row hotkey-row">
          <span className="settings-label">プリセット</span>
          <div className="preset-switch">
            {PRESETS.map((item) => (
              <button
                key={item}
                className={item === preset ? "settings-btn preset-active" : "settings-btn"}
                onClick={() => void useKeymapStore.getState().setPreset(item)}
              >
                {PRESET_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-list">
          {ALL_ACTIONS.map((action) => {
            const custom = overrides[action];
            const seqs = custom ?? defaultSeqs(action, preset);
            const isRecording = recording === action;
            return (
              <div key={action} className="settings-row">
                <span className="settings-label">{ACTION_LABELS[action]}</span>
                <span className={isRecording ? "settings-keys recording" : "settings-keys"}>
                  {isRecording
                    ? recorded.length > 0
                      ? recorded.join(" ")
                      : "キーを入力…"
                    : seqs.map((seq) => <kbd key={seq}>{seq}</kbd>)}
                </span>
                {custom && !isRecording && <span className="settings-custom">変更済</span>}
                <button
                  className="settings-btn"
                  onClick={() => {
                    setRecording(action);
                    setRecorded([]);
                  }}
                >
                  変更
                </button>
                {custom && !isRecording && (
                  <button
                    className="settings-btn"
                    onClick={() => void useKeymapStore.getState().resetOverride(action)}
                  >
                    戻す
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="dialog-actions">
          <span>
            <kbd>Esc</kbd> 閉じる
          </span>
        </div>
      </div>
    </div>
  );
}
