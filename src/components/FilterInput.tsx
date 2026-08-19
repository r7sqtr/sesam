import { useEffect, useRef } from "react";
import { usePanesStore } from "../stores/panes";
import { useUiStore } from "../stores/ui";

export function FilterInput() {
  const filter = usePanesStore((state) => state.panes[state.active].filter);
  const setFilter = usePanesStore((state) => state.setFilter);
  const clearFilter = usePanesStore((state) => state.clearFilter);
  const setMode = useUiStore((state) => state.setMode);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      setMode("normal");
    } else if (event.key === "Escape") {
      event.preventDefault();
      clearFilter();
      setMode("normal");
    }
  };

  return (
    <div className="filter-bar">
      <span className="filter-prefix">/</span>
      <input
        ref={inputRef}
        className="filter-input"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="ファイル名でフィルタ"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}
