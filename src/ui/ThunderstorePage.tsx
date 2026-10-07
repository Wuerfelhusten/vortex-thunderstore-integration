import React from "react";
import { ThunderstoreApiClient } from "../api";
import { GameCatalog } from "../catalog";
import { CommunityPackageView, BrowseTab, SortMode, PickerName, PAGE_SIZE, packageView, packageKey, normalizedPackageKey, selectPackages } from "./browse-model";
import { PackageCard } from "./PackageCard";
import { Pagination } from "./Pagination";
import { BrowseToolbar } from "./BrowseToolbar";
import { BrowseTabs } from "./BrowseTabs";

export interface ThunderstorePageProps {
  catalog: GameCatalog;
  client: ThunderstoreApiClient;
  getActiveGameId: () => string | undefined;
  getInstalledPackageKeys: () => ReadonlySet<string>;
  installPackage: (namespace: string, name: string, version: string, isModpack?: boolean) => Promise<void>;
}

export function ThunderstorePage({ catalog, client, getActiveGameId, getInstalledPackageKeys, installPackage }: ThunderstorePageProps): React.ReactElement {
  const gameId = getActiveGameId();
  const resolution = gameId === undefined ? undefined : catalog.resolve(gameId);
  const entry = resolution?.kind === "resolved" ? resolution.entry : undefined;
  const status = gameId === undefined ? "no-game" : entry?.status ?? resolution?.kind ?? "unmapped";
  const community = entry?.community;
  const [query, setQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<BrowseTab>("mods");
  const [packages, setPackages] = React.useState<CommunityPackageView[]>([]);
  const [sortMode, setSortMode] = React.useState<SortMode>("popular");
  const [page, setPage] = React.useState(1);
  const [jumpValue, setJumpValue] = React.useState("1");
  const [openPicker, setOpenPicker] = React.useState<PickerName | undefined>();
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [installingKey, setInstallingKey] = React.useState<string | undefined>();
  const [installError, setInstallError] = React.useState<string | undefined>();
  const installedPackageKeys = getInstalledPackageKeys();

  React.useEffect(() => {
    if (gameId === undefined || entry === undefined || status !== "verified" || !entry.capabilities.includes("browse") || community === undefined) {
      setPackages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void client.getCommunityPackages(community)
      .then((values) => {
        if (cancelled) return;
        const parsed = values.flatMap((value) => {
          const item = packageView(value);
          return item === undefined ? [] : [item];
        });
        setPackages(parsed);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [client, community, entry, gameId, refreshToken, status]);

  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const sortedPackages = selectPackages(packages, activeTab, query, sortMode);

  const pageCount = Math.max(1, Math.ceil(sortedPackages.length / PAGE_SIZE));
  const visiblePackages = sortedPackages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const install = async (item: CommunityPackageView): Promise<void> => {
    if (item.latestVersion === undefined) return;
    const key = packageKey(item);
    setInstallingKey(key);
    setInstallError(undefined);
    try {
      await installPackage(item.owner, item.name, item.latestVersion, item.isModpack);
    } catch (reason: unknown) {
      setInstallError(String(reason));
    } finally {
      setInstallingKey(undefined);
    }
  };

  React.useEffect(() => { setPage(1); }, [activeTab, normalizedQuery, sortMode]);
  React.useEffect(() => { setJumpValue(String(page)); }, [page]);
  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const message = gameId === undefined
    ? "Select a game profile first."
    : resolution?.kind === "ambiguous"
      ? "This game has multiple Thunderstore mappings and cannot be selected safely."
      : status !== "verified"
        ? "This game does not have a verified Nexus/Thunderstore mapping with Vortex support."
      : undefined;

  if (gameId === undefined || entry === undefined || status !== "verified") {
    return (
      <section className="h-full overflow-y-auto p-6" aria-labelledby="thunderstore-title">
        <h1 id="thunderstore-title">Thunderstore</h1>
        <p>{message}</p>
      </section>
    );
  }

  return (
    <section className="h-full overflow-y-auto pt-6" aria-labelledby="thunderstore-title">
      <BrowseTabs activeTab={activeTab} onSelect={setActiveTab} counts={{
        mods: packages.filter((item) => !item.isModpack).length,
        modpacks: packages.filter((item) => item.isModpack).length,
      }} />
      <div id={`tabcontent-thunderstore-${activeTab}`} role="tabpanel" aria-labelledby={`tablist-thunderstore-${activeTab}`}>
      <div className="space-y-3 p-6">
        <BrowseToolbar activeTab={activeTab} query={query} setQuery={setQuery} setPage={setPage}
          refresh={() => setRefreshToken((value) => value + 1)} resultCount={sortedPackages.length}
          openPicker={openPicker} setOpenPicker={setOpenPicker} sortMode={sortMode} setSortMode={setSortMode} />

        {loading ? <div className="p-5 text-center text-neutral-subdued text-body-sm">Loading Thunderstore mods …</div> : null}
        {error !== undefined ? <div className="p-5 text-center text-danger-strong text-body-sm" role="alert">Could not load the Thunderstore catalog: {error}</div> : null}
        {installError !== undefined ? <div className="p-2.5 text-danger-strong text-body-sm" role="alert">Installation failed: {installError}</div> : null}

        {!loading && error === undefined ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(26rem,1fr))] gap-4">
            {visiblePackages.length === 0 ? <div className="p-5 text-center text-neutral-subdued text-body-sm">{activeTab === "modpacks" ? "No modpacks match your search." : "No mods match your search."}</div> : null}
            {visiblePackages.map((item) => (
              <PackageCard key={packageKey(item)} item={item}
                installed={installedPackageKeys.has(normalizedPackageKey(item.owner, item.name))}
                installing={installingKey === packageKey(item)} activeTab={activeTab} onInstall={install} />
            ))}
          </div>
        ) : null}

        <Pagination page={page} pageCount={pageCount} jumpValue={jumpValue} setPage={setPage} setJumpValue={setJumpValue} />
      </div>
      </div>
    </section>
  );
}
