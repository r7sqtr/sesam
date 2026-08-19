import { usePanesStore } from "../stores/panes";
import { PathBar } from "./PathBar";
import { ListHeader } from "./ListHeader";
import { EntryList } from "./EntryList";

export function DirPane({
  paneIndex,
  style,
}: {
  paneIndex: number;
  style?: React.CSSProperties;
}) {
  const isActive = usePanesStore((state) => state.active === paneIndex);
  const paneCount = usePanesStore((state) => state.panes.length);

  const classes = ["dir-pane"];
  if (paneCount > 1) {
    classes.push(isActive ? "active-pane" : "inactive-pane");
  }

  return (
    <div className={classes.join(" ")} style={style} data-pane={paneIndex}>
      <PathBar paneIndex={paneIndex} />
      <ListHeader paneIndex={paneIndex} />
      <EntryList paneIndex={paneIndex} />
    </div>
  );
}
