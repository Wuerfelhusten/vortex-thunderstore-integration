import React from "react";
import { BrowseTab } from "./browse-model";

interface BrowseTabsProps {
  activeTab: BrowseTab;
  counts: Record<BrowseTab, number>;
  onSelect: (tab: BrowseTab) => void;
}

// Mirrors Vortex's TabBar/TabButton DOM; styling comes from the host, not
// extension-specific approximations. These components are not public API.
export function BrowseTabs({ activeTab, counts, onSelect }: BrowseTabsProps): React.ReactElement {
  const tabs: BrowseTab[] = ["mods", "modpacks"];
  const buttons = React.useRef<Partial<Record<BrowseTab, HTMLButtonElement | null>>>({});
  return (
    <div className="nxm-tab-bar nxm-tab-bar-primary overflow-clip pl-6">
      <div className="nxm-tab-bar-scroller" role="tablist" aria-label="Thunderstore content">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            ref={(element) => { buttons.current[tab] = element; }}
            id={`tablist-thunderstore-${tab}`}
            type="button"
            role="tab"
            aria-controls={`tabcontent-thunderstore-${tab}`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            className={`nxm-tab-button${activeTab === tab ? " nxm-tab-button-selected" : ""}`}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => {
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                  : event.key === "ArrowRight" ? (index + 1) % tabs.length : undefined;
              if (next === undefined) return;
              event.preventDefault();
              buttons.current[tabs[next]]?.focus();
              onSelect(tabs[next]);
            }}
          >
            <span className="nxm-tab-button-content">
              {tab === "modpacks" ? "Modpacks" : "Mods"}
              <span className="nxm-tab-button-count">{counts[tab].toLocaleString("en-US")}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
