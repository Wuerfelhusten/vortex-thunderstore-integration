import React from "react";
import { Icon } from "@nexusmods/vortex-api";
import { BrowseTab, SortMode, PickerName, SORT_OPTIONS } from "./browse-model";

interface BrowseToolbarProps {
  activeTab: BrowseTab;
  query: string;
  setQuery: (value: string) => void;
  setPage: (value: number) => void;
  refresh: () => void;
  resultCount: number;
  openPicker: PickerName | undefined;
  setOpenPicker: (value: PickerName | undefined) => void;
  sortMode: SortMode;
  setSortMode: (value: SortMode) => void;
}

export function BrowseToolbar({ activeTab, query, setQuery, setPage, refresh, resultCount, openPicker, setOpenPicker, sortMode, setSortMode }: BrowseToolbarProps): React.ReactElement {
  return <>
    <form className="flex items-center gap-x-2" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
      <input
        id="thunderstore-search"
        type="search"
        value={query}
        placeholder={activeTab === "modpacks" ? "Search modpacks..." : "Search mods..."}
        aria-label={activeTab === "modpacks" ? "Search modpacks" : "Search mods"}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
        className="nxm-input max-w-60"
      />
      <button
        type="submit"
        aria-label="Search"
        title="Search"
        className="nxm-button nxm-button-neutral nxm-button-moderate nxm-button-icon-only"
      >
        <span className="nxm-button-icon"><Icon name="search" className="size-4" /></span>
      </button>
    </form>

    <div className="flex items-center justify-between">
      <div className="flex items-center gap-x-2">
        <button
          type="button"
          aria-label="Refresh"
          title="Refresh"
          className="nxm-button nxm-button-neutral nxm-button-moderate nxm-button-icon-only"
          onClick={refresh}
        >
          <span className="nxm-button-icon"><Icon name="refresh" className="size-4" /></span>
        </button>
        <span className="text-translucent-moderate text-body-sm">{resultCount.toLocaleString("en-US")} results</span>
      </div>
      <div className="nxm-dropdown relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={openPicker === "sort"}
          className="nxm-button nxm-button-neutral nxm-button-moderate nxm-button-sm"
          onClick={() => setOpenPicker(openPicker === "sort" ? undefined : "sort")}
        >
          <span>{SORT_OPTIONS.find((option) => option.value === sortMode)?.label ?? "Most Downloaded"}</span>
          <span className="nxm-button-icon"><Icon name="sort-down" className="size-4" /></span>
        </button>
        {openPicker === "sort" ? (
          <div
            role="listbox"
            aria-label="Sort collections"
            className="nxm-dropdown-items absolute right-0 top-full mt-1"
          >
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={sortMode === option.value}
                className={`nxm-dropdown-item ${sortMode === option.value ? "nxm-dropdown-item-active" : ""}`}
                onClick={() => { setSortMode(option.value); setOpenPicker(undefined); }}
              >
                <span className="nxm-dropdown-item-label">{option.label}</span>
                {sortMode === option.value ? <Icon name="checkbox-checked" className="ml-auto size-4" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>

  </>;
}
