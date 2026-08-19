import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AppWindow,
  Archive,
  Clipboard,
  Copy,
  ExternalLink,
  FolderPlus,
  FolderSearch,
  PackageOpen,
  PenLine,
  Scissors,
  Trash2,
} from "lucide-react";
import { useUiStore } from "../stores/ui";
import { activePane, usePanesStore } from "../stores/panes";
import {
  compressSelection,
  extractArchive,
  paste,
  requestMkdir,
  requestRename,
  requestTrash,
  selectionEntries,
  yankOrCut,
} from "../ops";

type MenuItem = { label: string; icon: React.ReactNode; run: () => void } | "sep";

const ICON = { size: 14, strokeWidth: 1.8 } as const;

export function ContextMenu() {
  const menu = useUiStore((state) => state.contextMenu);

  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.getState().setContextMenu(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [menu]);

  if (!menu) return null;

  const close = () => useUiStore.getState().setContextMenu(null);
  const cwd = activePane(usePanesStore.getState()).cwd;

  const entryItems: MenuItem[] = [
    {
      label: "開く",
      icon: <ExternalLink {...ICON} />,
      run: () => void invoke("open_entries", { paths: selectionEntries().map((e) => e.path) }),
    },
    {
      label: "別のアプリで開く",
      icon: <AppWindow {...ICON} />,
      run: () => {
        const entries = selectionEntries();
        useUiStore.getState().setDialog({
          kind: "open-with",
          paths: entries.map((e) => e.path),
          dirPath: cwd,
        });
      },
    },
    {
      label: "Finder で表示",
      icon: <FolderSearch {...ICON} />,
      run: () => void invoke("reveal_in_finder", { path: menu.entryPath }),
    },
    "sep",
    { label: "コピー（ヤンク）", icon: <Copy {...ICON} />, run: () => yankOrCut(false) },
    { label: "カット", icon: <Scissors {...ICON} />, run: () => yankOrCut(true) },
    { label: "ペースト", icon: <Clipboard {...ICON} />, run: () => void paste() },
    "sep",
    { label: "リネーム", icon: <PenLine {...ICON} />, run: () => requestRename() },
    { label: "ゴミ箱へ移動", icon: <Trash2 {...ICON} />, run: () => requestTrash() },
    "sep",
    { label: "zip圧縮", icon: <Archive {...ICON} />, run: () => void compressSelection() },
    ...(menu.entryPath?.toLowerCase().endsWith(".zip")
      ? ([
          {
            label: "展開",
            icon: <PackageOpen {...ICON} />,
            run: () => void extractArchive(menu.entryPath as string),
          },
        ] as MenuItem[])
      : []),
    "sep",
    { label: "新規フォルダ", icon: <FolderPlus {...ICON} />, run: () => requestMkdir() },
  ];

  const emptyItems: MenuItem[] = [
    { label: "ペースト", icon: <Clipboard {...ICON} />, run: () => void paste() },
    { label: "新規フォルダ", icon: <FolderPlus {...ICON} />, run: () => requestMkdir() },
    "sep",
    {
      label: "このフォルダを Finder で開く",
      icon: <FolderSearch {...ICON} />,
      run: () => void invoke("open_entries", { paths: [cwd] }),
    },
  ];

  const items = menu.entryPath ? entryItems : emptyItems;
  const x = Math.min(menu.x, window.innerWidth - 210);
  const y = Math.min(menu.y, window.innerHeight - items.length * 30 - 20);

  return (
    <div
      className="context-backdrop"
      onMouseDown={close}
      onContextMenu={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div
        className="context-menu"
        style={{ left: x, top: y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {items.map((item, index) =>
          item === "sep" ? (
            <div key={`sep-${index}`} className="context-sep" />
          ) : (
            <button
              key={item.label}
              className="context-item"
              onClick={() => {
                close();
                item.run();
              }}
            >
              <span className="context-icon">{item.icon}</span>
              {item.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
