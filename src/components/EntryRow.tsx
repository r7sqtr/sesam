import { memo } from "react";
import type { Entry } from "../types";
import { formatDate, formatSize } from "../lib/format";
import { EntryIcon } from "../lib/icons";
import { iconKey, useIcon } from "../lib/iconCache";

interface EntryRowProps {
  entry: Entry;
  active: boolean;
  marked: boolean;
  inRange: boolean;
  cut: boolean;
  dropTarget: boolean;
}

export const EntryRow = memo(function EntryRow({
  entry,
  active,
  marked,
  inRange,
  cut,
  dropTarget,
}: EntryRowProps) {
  const iconSrc = useIcon(iconKey(entry), entry.path);
  const classes = ["entry-row"];
  if (active) classes.push("active");
  if (marked) classes.push("marked");
  if (inRange) classes.push("in-range");
  if (cut) classes.push("cut-pending");
  if (dropTarget) classes.push("drop-target");
  if (entry.isHidden) classes.push("hidden-entry");

  return (
    <div
      className={classes.join(" ")}
      data-path={entry.path}
      data-dir={entry.isDir ? "true" : "false"}
    >
      <span className="entry-mark">{marked ? "●" : ""}</span>
      <span className="entry-icon">
        {iconSrc ? (
          <img className="entry-icon-img" src={iconSrc} alt="" draggable={false} />
        ) : (
          <EntryIcon entry={entry} />
        )}
      </span>
      <span className="entry-name">
        {entry.name}
        {entry.isSymlink && <span className="entry-symlink"> ⇢</span>}
      </span>
      <span className="entry-size">{formatSize(entry.size, entry.isDir)}</span>
      <span className="entry-date">{formatDate(entry.mtimeMs)}</span>
    </div>
  );
});
