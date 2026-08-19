import { useRef } from "react";
import { Plus, X } from "lucide-react";
import { usePanesStore } from "../stores/panes";

export function TabStrip() {
  const tabs = usePanesStore((state) => state.tabs);
  const activeTab = usePanesStore((state) => state.activeTab);
  const liveCwd = usePanesStore((state) => state.panes[state.active]?.cwd ?? "");
  const stripRef = useRef<HTMLDivElement>(null);

  if (tabs.length <= 1) return null;

  const label = (index: number) => {
    const snapshot = tabs[index];
    const cwd =
      index === activeTab ? liveCwd : snapshot.panes[snapshot.active]?.cwd ?? "";
    if (cwd === "/" || cwd === "") return "/";
    return cwd.slice(cwd.lastIndexOf("/") + 1) || "/";
  };

  const onTabMouseDown = (event: React.MouseEvent, index: number) => {
    if ((event.target as HTMLElement).closest(".tab-close")) return;
    usePanesStore.getState().switchTab(index);
    let current = index;
    const onMove = (move: MouseEvent) => {
      const strip = stripRef.current;
      if (!strip) return;
      const tabEls = Array.from(strip.querySelectorAll<HTMLElement>(".tab"));
      let target = 0;
      for (const el of tabEls) {
        const rect = el.getBoundingClientRect();
        if (move.clientX > rect.left + rect.width / 2) {
          target += 1;
        }
      }
      target = Math.min(Math.max(target - (target > current ? 1 : 0), 0), tabEls.length - 1);
      if (target !== current) {
        usePanesStore.getState().moveTab(current, target);
        current = target;
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="tab-strip" ref={stripRef}>
      {tabs.map((_, index) => (
        <div
          key={index}
          className={index === activeTab ? "tab active" : "tab"}
          onMouseDown={(event) => onTabMouseDown(event, index)}
        >
          <span className="tab-label">{label(index)}</span>
          <button
            className="tab-close"
            title="タブを閉じる (⌘W)"
            onClick={() => usePanesStore.getState().closeTab(index)}
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>
      ))}
      <button
        className="tab-add"
        title="新規タブ (⌘T)"
        onClick={() => usePanesStore.getState().newTab()}
      >
        <Plus size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}
