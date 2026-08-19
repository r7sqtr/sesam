import { usePanesStore } from "../stores/panes";
import type { SortMode } from "../types";

export function ListHeader({ paneIndex }: { paneIndex: number }) {
  const sort = usePanesStore((state) => state.panes[paneIndex]?.sort ?? "name");
  const sortDesc = usePanesStore((state) => state.panes[paneIndex]?.sortDesc ?? false);

  const clickSort = (mode: SortMode, defaultDesc: boolean) => {
    const store = usePanesStore.getState();
    store.setActive(paneIndex);
    const pane = store.panes[paneIndex];
    const desc = pane.sort === mode ? !pane.sortDesc : defaultDesc;
    store.setSort(mode, desc);
  };

  const arrow = (mode: SortMode) => (sort === mode ? (sortDesc ? " ↓" : " ↑") : "");

  return (
    <div className="list-header">
      <span className="lh-lead" />
      <button className="lh-col lh-name" onClick={() => clickSort("name", false)}>
        名前{arrow("name")}
      </button>
      <button className="lh-col lh-size" onClick={() => clickSort("size", true)}>
        サイズ{arrow("size")}
      </button>
      <button className="lh-col lh-date" onClick={() => clickSort("mtime", true)}>
        変更日{arrow("mtime")}
      </button>
    </div>
  );
}
