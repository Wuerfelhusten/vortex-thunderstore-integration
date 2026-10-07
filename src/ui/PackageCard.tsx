import React from "react";
import { Icon } from "@nexusmods/vortex-api";
import { CommunityPackageView, BrowseTab, formatDownloads } from "./browse-model";

export interface PackageCardProps {
  item: CommunityPackageView;
  installed: boolean;
  installing: boolean;
  activeTab: BrowseTab;
  onInstall: (item: CommunityPackageView) => Promise<void>;
}

export function PackageCard({ item, installed, installing, activeTab, onInstall }: PackageCardProps): React.ReactElement {
  return (
    <article className="w-full rounded-md bg-surface-mid">
      <div className="flex items-start gap-x-3.5 p-3">
        <div className="relative aspect-collection w-full max-w-35 shrink-0 overflow-hidden rounded-xs bg-surface-translucent-mid">
          {item.iconUrl === undefined
            ? <div className="flex size-full items-center justify-center text-primary-moderate text-heading-sm font-semibold" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</div>
            : <img src={item.iconUrl} alt="" className="size-full object-cover" />}
          {item.pinned ? (
            <div className="absolute inset-x-0 bottom-0 z-2 flex h-7 items-center gap-x-1 bg-info-weak px-1.5 text-info-50 text-title-xs">
              <Icon name="bookmark" className="size-4" />
              <span title="Pinned">Pinned</span>
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 grow flex-col gap-y-1.5">
          <div className="flex flex-col gap-y-1">
            <div className="truncate font-semibold wrap-break-word text-body-lg" title={item.name}>{item.name}</div>
            <div className="flex items-center gap-x-1 text-neutral-moderate text-body-sm">
              <Icon name="author" className="size-4" />
              <span className="truncate">{item.owner}</span>
            </div>
          </div>
          <div className="flex items-center gap-x-1.5 border-t border-stroke-weak pt-1.5 text-info-moderate text-body-sm" title={item.category ?? (item.isModpack ? "Modpack" : "Thunderstore mod")}>
            <span className="truncate">{item.category ?? (item.isModpack ? "Modpack" : "Thunderstore mod")}</span>
            {item.nsfw ? <span className="text-danger-strong">Adult</span> : null}
          </div>
          <div className="flex items-center gap-x-5 border-t border-stroke-weak pt-1.5 text-neutral-moderate text-body-sm">
            <span className="flex items-center gap-x-1" title="Rating score">
              <Icon name="endorse-yes" className="size-4 text-neutral-subdued" />
              <span>{formatDownloads(item.ratingScore)}</span>
            </span>
            <span className="flex items-center gap-x-1" title="Downloads">
              <Icon name="download" className="size-4 text-neutral-subdued" />
              <span>{formatDownloads(item.downloads)}</span>
            </span>
            <span className="flex items-center gap-x-1" title="Version">
              <Icon name="tags" className="size-4 text-neutral-subdued" />
              <span>{item.latestVersion ?? "—"}</span>
            </span>
          </div>
          <div className="line-clamp-3 border-t border-stroke-weak pt-1.5 text-neutral-subdued text-body-sm wrap-break-word">
            {item.description ?? "Thunderstore package."}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-x-2 rounded-b bg-surface-translucent-low px-3 py-2">
        {installed ? (
          <button
            type="button"
            disabled
            className="nxm-button nxm-button-neutral nxm-button-weak nxm-button-sm nxm-button-disabled"
            title={`${item.name} is already installed in Vortex`}
          >
            <span className="nxm-button-icon"><Icon name="checkbox-checked" className="size-4" /></span>
            Installed
          </button>
        ) : item.latestVersion === undefined ? null : (
          <button
            type="button"
            disabled={installing}
            className={`nxm-button nxm-button-primary nxm-button-strong nxm-button-sm ${installing ? "nxm-button-disabled" : ""}`}
            title={`${activeTab === "modpacks" ? "Install modpack" : "Install"} ${item.name} in Vortex`}
            aria-label={`${activeTab === "modpacks" ? "Install modpack" : "Install"} ${item.name} in Vortex`}
            onClick={() => { void onInstall(item); }}
          >
            {installing ? "…" : "Install"}
          </button>
        )}
        {item.packageUrl === undefined ? null : (
          <a
            href={item.packageUrl}
            target="_blank"
            rel="noreferrer"
            title={`Open ${item.name} on Thunderstore`}
            className="nxm-button nxm-button-neutral nxm-button-weak nxm-button-sm"
          >
            <span className="nxm-button-icon"><Icon name="launch" className="size-4" /></span>
            View Page
          </a>
        )}
      </div>
    </article>
  );
}
