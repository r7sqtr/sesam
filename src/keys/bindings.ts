import type { Binding } from "./engine";

export type Action =
  | "cursor-down"
  | "cursor-up"
  | "cursor-top"
  | "cursor-bottom"
  | "half-down"
  | "half-up"
  | "enter"
  | "parent"
  | "toggle-hidden"
  | "cycle-sort"
  | "start-filter"
  | "escape"
  | "visual-start"
  | "visual-exit"
  | "toggle-mark"
  | "yank"
  | "cut"
  | "paste"
  | "trash"
  | "rename"
  | "mkdir"
  | "cancel-task"
  | "clear-register"
  | "toggle-dual"
  | "switch-pane"
  | "focus-left"
  | "focus-right"
  | "toggle-preview"
  | "open-settings"
  | "open-with"
  | "history-back"
  | "history-forward"
  | "tab-next"
  | "tab-prev"
  | "edit-path"
  | "fuzzy-jump"
  | "compress"
  | "go-home";

export const ACTION_LABELS: Record<Action, string> = {
  "cursor-down": "カーソル下",
  "cursor-up": "カーソル上",
  "cursor-top": "リスト先頭へ",
  "cursor-bottom": "リスト末尾へ",
  "half-down": "半ページ下へ",
  "half-up": "半ページ上へ",
  enter: "開く（フォルダに入る）",
  parent: "親フォルダへ",
  "toggle-hidden": "隠しファイル表示切替",
  "cycle-sort": "並び替えメニュー",
  "start-filter": "フィルタ入力",
  escape: "キャンセル / パネルを閉じる",
  "visual-start": "ビジュアル選択開始",
  "visual-exit": "ビジュアル選択終了",
  "toggle-mark": "マーク切替",
  yank: "ヤンク（コピー）",
  cut: "カット",
  paste: "ペースト",
  trash: "ゴミ箱へ移動",
  rename: "リネーム",
  mkdir: "新規フォルダ",
  "cancel-task": "実行中の処理を中止",
  "clear-register": "カット/ヤンク取消",
  "toggle-dual": "2ペイン分割切替",
  "switch-pane": "ペイン切替（トグル）",
  "focus-left": "左ペインへフォーカス",
  "focus-right": "右ペインへフォーカス",
  "toggle-preview": "プレビュー表示切替",
  "open-settings": "設定を開く",
  "open-with": "別のアプリで開く",
  "history-back": "履歴を戻る",
  "history-forward": "履歴を進む",
  "tab-next": "次のタブへ",
  "tab-prev": "前のタブへ",
  "edit-path": "パスを直接入力",
  "fuzzy-jump": "検索パレット",
  compress: "zip に圧縮",
  "go-home": "ホームへ移動",
};

const MOVEMENT: Binding<Action>[] = [
  { seq: ["j"], action: "cursor-down" },
  { seq: ["ArrowDown"], action: "cursor-down" },
  { seq: ["k"], action: "cursor-up" },
  { seq: ["ArrowUp"], action: "cursor-up" },
  { seq: ["g", "g"], action: "cursor-top" },
  { seq: ["G"], action: "cursor-bottom" },
  { seq: ["ctrl+d"], action: "half-down" },
  { seq: ["ctrl+u"], action: "half-up" },
];

export const NORMAL_BINDINGS: Binding<Action>[] = [
  ...MOVEMENT,
  { seq: ["h"], action: "parent" },
  { seq: ["ArrowLeft"], action: "parent" },
  { seq: ["Backspace"], action: "parent" },
  { seq: ["l"], action: "enter" },
  { seq: ["ArrowRight"], action: "enter" },
  { seq: ["Enter"], action: "enter" },
  { seq: ["."], action: "toggle-hidden" },
  { seq: ["s"], action: "cycle-sort" },
  { seq: ["/"], action: "start-filter" },
  { seq: ["f"], action: "fuzzy-jump" },
  { seq: ["v"], action: "visual-start" },
  { seq: [" "], action: "toggle-mark" },
  { seq: ["y"], action: "yank" },
  { seq: ["d"], action: "cut" },
  { seq: ["p"], action: "paste" },
  { seq: ["t"], action: "trash" },
  { seq: ["x"], action: "clear-register" },
  { seq: ["r"], action: "rename" },
  { seq: ["a"], action: "mkdir" },
  { seq: ["z"], action: "compress" },
  { seq: ["~"], action: "go-home" },
  { seq: ["ctrl+c"], action: "cancel-task" },
  { seq: ["\\"], action: "toggle-dual" },
  { seq: ["Tab"], action: "switch-pane" },
  { seq: ["ctrl+h"], action: "focus-left" },
  { seq: ["ctrl+l"], action: "focus-right" },
  { seq: ["i"], action: "toggle-preview" },
  { seq: [","], action: "open-settings" },
  { seq: ["o"], action: "open-with" },
  { seq: ["ctrl+o"], action: "history-back" },
  { seq: ["ctrl+i"], action: "history-forward" },
  { seq: ["ctrl+Tab"], action: "tab-next" },
  { seq: ["ctrl+shift+Tab"], action: "tab-prev" },
  { seq: ["Escape"], action: "escape" },
];

export const VISUAL_BINDINGS: Binding<Action>[] = [
  ...MOVEMENT,
  { seq: ["y"], action: "yank" },
  { seq: ["d"], action: "cut" },
  { seq: ["t"], action: "trash" },
  { seq: ["v"], action: "visual-exit" },
  { seq: ["Escape"], action: "visual-exit" },
];

export type KeymapPreset = "vim" | "standard";

export const PRESET_LABELS: Record<KeymapPreset, string> = {
  vim: "Vim",
  standard: "標準",
};

const STANDARD_MOVEMENT: Binding<Action>[] = [
  { seq: ["ArrowDown"], action: "cursor-down" },
  { seq: ["ArrowUp"], action: "cursor-up" },
  { seq: ["Home"], action: "cursor-top" },
  { seq: ["End"], action: "cursor-bottom" },
  { seq: ["PageDown"], action: "half-down" },
  { seq: ["PageUp"], action: "half-up" },
];

const STANDARD_NORMAL: Binding<Action>[] = [
  ...STANDARD_MOVEMENT,
  { seq: ["Enter"], action: "enter" },
  { seq: ["ArrowRight"], action: "enter" },
  { seq: ["cmd+ArrowDown"], action: "enter" },
  { seq: ["ArrowLeft"], action: "parent" },
  { seq: ["Backspace"], action: "parent" },
  { seq: ["cmd+ArrowUp"], action: "parent" },
  { seq: ["cmd+shift+."], action: "toggle-hidden" },
  { seq: ["cmd+s"], action: "cycle-sort" },
  { seq: ["cmd+f"], action: "start-filter" },
  { seq: ["cmd+j"], action: "fuzzy-jump" },
  { seq: [" "], action: "toggle-mark" },
  { seq: ["shift+ArrowDown"], action: "visual-start" },
  { seq: ["shift+ArrowUp"], action: "visual-start" },
  { seq: ["cmd+c"], action: "yank" },
  { seq: ["cmd+x"], action: "cut" },
  { seq: ["cmd+v"], action: "paste" },
  { seq: ["Delete"], action: "trash" },
  { seq: ["cmd+Backspace"], action: "trash" },
  { seq: ["cmd+shift+x"], action: "clear-register" },
  { seq: ["F2"], action: "rename" },
  { seq: ["cmd+shift+n"], action: "mkdir" },
  { seq: ["cmd+k"], action: "compress" },
  { seq: ["cmd+shift+h"], action: "go-home" },
  { seq: ["cmd+."], action: "cancel-task" },
  { seq: ["cmd+["], action: "history-back" },
  { seq: ["cmd+]"], action: "history-forward" },
  { seq: ["ctrl+Tab"], action: "tab-next" },
  { seq: ["ctrl+shift+Tab"], action: "tab-prev" },
  { seq: ["cmd+\\"], action: "toggle-dual" },
  { seq: ["Tab"], action: "switch-pane" },
  { seq: ["cmd+shift+ArrowLeft"], action: "focus-left" },
  { seq: ["cmd+shift+ArrowRight"], action: "focus-right" },
  { seq: ["cmd+y"], action: "toggle-preview" },
  { seq: ["cmd+o"], action: "open-with" },
  { seq: ["cmd+,"], action: "open-settings" },
  { seq: ["Escape"], action: "escape" },
];

const STANDARD_VISUAL: Binding<Action>[] = [
  ...STANDARD_MOVEMENT,
  { seq: ["shift+ArrowDown"], action: "cursor-down" },
  { seq: ["shift+ArrowUp"], action: "cursor-up" },
  { seq: ["cmd+c"], action: "yank" },
  { seq: ["cmd+x"], action: "cut" },
  { seq: ["Delete"], action: "trash" },
  { seq: ["cmd+Backspace"], action: "trash" },
  { seq: ["Escape"], action: "visual-exit" },
];

export function presetBindings(preset: KeymapPreset): {
  normal: Binding<Action>[];
  visual: Binding<Action>[];
} {
  if (preset === "standard") {
    return { normal: STANDARD_NORMAL, visual: STANDARD_VISUAL };
  }
  return { normal: NORMAL_BINDINGS, visual: VISUAL_BINDINGS };
}
