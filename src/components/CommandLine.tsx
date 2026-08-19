import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { activePane, usePanesStore } from "../stores/panes";
import { useUiStore } from "../stores/ui";
import { recordOp } from "../undo";

export function CommandLine() {
  const inputPrompt = useUiStore((state) => state.inputPrompt);
  const setInputPrompt = useUiStore((state) => state.setInputPrompt);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!inputPrompt) return;
    setValue(inputPrompt.kind === "rename" ? inputPrompt.initial : "");
    setError(null);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (inputPrompt.kind === "rename") {
        const dot = inputPrompt.initial.lastIndexOf(".");
        input.setSelectionRange(0, dot > 0 ? dot : inputPrompt.initial.length);
      }
    });
  }, [inputPrompt]);

  if (!inputPrompt) return null;

  const commit = async () => {
    const panes = usePanesStore.getState();
    try {
      if (inputPrompt.kind === "rename") {
        const newPath = await invoke<string>("rename_entry", {
          path: inputPrompt.path,
          newName: value,
        });
        recordOp({ kind: "rename", from: inputPrompt.path, to: newPath });
        setInputPrompt(null);
        await panes.refresh();
        panes.cursorToPath(newPath);
      } else {
        const newPath = await invoke<string>("create_folder", {
          parent: activePane(panes).cwd,
          name: value,
        });
        recordOp({ kind: "mkdir", path: newPath });
        setInputPrompt(null);
        await panes.refresh();
        panes.cursorToPath(newPath);
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setInputPrompt(null);
    }
  };

  return (
    <div className="command-line">
      <span className="command-label">
        {inputPrompt.kind === "rename" ? "リネーム:" : "新規フォルダ:"}
      </span>
      <input
        ref={inputRef}
        className="command-input"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
      {error && <span className="command-error">{error}</span>}
    </div>
  );
}
