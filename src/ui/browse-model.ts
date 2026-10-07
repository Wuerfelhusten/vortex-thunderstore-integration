export interface CommunityPackageView {
  owner: string;
  name: string;
  packageUrl?: string;
  latestVersion?: string;
  iconUrl?: string;
  pinned: boolean;
  nsfw: boolean;
  ratingScore: number;
  downloads: number;
  updatedAt?: string;
  category?: string;
  categories: string[];
  isModpack: boolean;
  description?: string;
}

export type SortMode = "popular" | "name" | "updated";
export type PickerName = "sort";
export type BrowseTab = "mods" | "modpacks";

export const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "popular", label: "Most Downloaded" },
  { value: "updated", label: "Recently Updated" },
  { value: "name", label: "Name" },
];

export const PAGE_SIZE = 20;
const allowedImageHosts = new Set(["gcdn.thunderstore.io", "ccdn.thunderstore.io", "thunderstore.io"]);

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedImageHosts.has(url.hostname) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function packageView(value: unknown): CommunityPackageView | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as {
    owner?: unknown;
    name?: unknown;
    package_url?: unknown;
    date_updated?: unknown;
    is_pinned?: unknown;
    has_nsfw_content?: unknown;
    rating_score?: unknown;
    categories?: unknown;
    versions?: unknown;
  };
  if (typeof candidate.owner !== "string" || typeof candidate.name !== "string") return undefined;

  const versions = Array.isArray(candidate.versions) ? candidate.versions : [];
  const categories = Array.isArray(candidate.categories)
    ? candidate.categories.filter((category): category is string => typeof category === "string")
    : [];
  const latest = versions.find((version) =>
    typeof version === "object" && version !== null && (version as { is_active?: unknown }).is_active !== false,
  ) as {
    version_number?: unknown;
    icon?: unknown;
    downloads?: unknown;
    description?: unknown;
  } | undefined;

  return {
    owner: candidate.owner,
    name: candidate.name,
    packageUrl: safeHttpsUrl(candidate.package_url),
    latestVersion: typeof latest?.version_number === "string" ? latest.version_number : undefined,
    iconUrl: safeHttpsUrl(latest?.icon),
    pinned: candidate.is_pinned === true,
    nsfw: candidate.has_nsfw_content === true,
    ratingScore: typeof candidate.rating_score === "number" ? candidate.rating_score : 0,
    downloads: typeof latest?.downloads === "number" ? latest.downloads : 0,
    updatedAt: typeof candidate.date_updated === "string" ? candidate.date_updated : undefined,
    category: categories.find((category) => category.toLocaleLowerCase("en-US") !== "modpacks"),
    categories,
    isModpack: categories.some((category) => {
      const normalized = category.trim().toLocaleLowerCase("en-US");
      return normalized === "modpack" || normalized === "modpacks";
    }),
    description: typeof latest?.description === "string" ? latest.description : undefined,
  };
}

export function packageKey(item: CommunityPackageView): string {
  return `${item.owner}/${item.name}`;
}

export function normalizedPackageKey(owner: string, name: string): string {
  return `${owner}/${name}`.toLocaleLowerCase("en-US");
}

export function formatDownloads(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return `${(value / 1_000_000).toFixed(value >= 100_000_000 ? 0 : 1)}m`;
}

export function selectPackages(packages: readonly CommunityPackageView[], activeTab: BrowseTab, query: string, sortMode: SortMode): CommunityPackageView[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const tabPackages = packages.filter((item) => activeTab === "modpacks" ? item.isModpack : !item.isModpack);
  const filteredPackages = tabPackages.filter((item) => {
    const searchableText = `${item.owner}/${item.name} ${item.categories.join(" ")} ${item.description ?? ""}`
      .toLocaleLowerCase("en-US");
    return normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);
  });

  const sortedPackages = [...filteredPackages].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (sortMode === "name") return packageKey(left).localeCompare(packageKey(right));
    if (sortMode === "updated") return (Date.parse(right.updatedAt ?? "") || 0) - (Date.parse(left.updatedAt ?? "") || 0);
    return (right.downloads - left.downloads) || (right.ratingScore - left.ratingScore) || packageKey(left).localeCompare(packageKey(right));
  });
  return sortedPackages;
}

export function pageNumbers(currentPage: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, 4, "ellipsis", pageCount];
  if (currentPage >= pageCount - 2) return [1, "ellipsis", pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", pageCount];
}
