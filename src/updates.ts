import { compareVersions } from "./versions";
import { packageIdentity } from "./identity";
import { InstalledThunderstoreMod, UpdateCandidate } from "./types";

interface StateLike {
  persistent?: {
    mods?: Record<string, Record<string, {
      attributes?: Record<string, unknown>;
      pinned?: boolean;
      ignored?: boolean;
      updateBlocked?: boolean;
    }> | undefined>;
  };
}

interface ThunderstorePackageVersionLike {
  version_number?: unknown;
  is_active?: unknown;
}

interface ThunderstorePackageLike {
  owner?: unknown;
  name?: unknown;
  versions?: unknown;
}

export function installedThunderstoreMods(state: unknown, gameId: string): InstalledThunderstoreMod[] {
  const mods = (state as StateLike | undefined)?.persistent?.mods?.[gameId] ?? {};
  return Object.entries(mods).flatMap(([modId, mod]) => {
    const metadata = mod.attributes?.thunderstore
      ?? (mod.attributes?.meta as { thunderstore?: unknown } | undefined)?.thunderstore;
    if (typeof metadata === "object" && metadata !== null) {
      const value = metadata as { source?: unknown; namespace?: unknown; packageName?: unknown; packageUuid?: unknown; community?: unknown; version?: unknown; vortexGameId?: unknown };
      if (value.source === "thunderstore"
        && typeof value.namespace === "string"
        && typeof value.packageName === "string"
        && typeof value.community === "string"
        && typeof value.version === "string") {
        return [{
          modId,
          identity: packageIdentity(value.namespace, value.packageName, typeof value.packageUuid === "string" ? value.packageUuid : undefined),
          community: value.community,
          vortexGameId: typeof value.vortexGameId === "string" ? value.vortexGameId : gameId,
          installedVersion: value.version,
          pinned: mod.pinned === true,
          ignored: mod.ignored === true,
          updateBlocked: mod.updateBlocked === true,
        }];
      }
    }

    const attributes = mod.attributes;
    if (attributes?.source !== "thunderstore"
      || typeof attributes.modId !== "string"
      || typeof attributes.fileId !== "string") return [];
    const [namespace, ...packageParts] = attributes.modId.split("/");
    const packageName = packageParts.join("/");
    if (!namespace || !packageName) return [];
    const community = typeof attributes.community === "string" ? attributes.community : gameId;
    return [{
      modId,
      identity: packageIdentity(namespace, packageName),
      community,
      vortexGameId: gameId,
      installedVersion: attributes.fileId,
      pinned: mod.pinned === true,
      ignored: mod.ignored === true,
      updateBlocked: mod.updateBlocked === true,
    }];
  });
}

export function indexCommunityVersions(packages: readonly unknown[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const candidate of packages) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const packageValue = candidate as ThunderstorePackageLike;
    if (typeof packageValue.owner !== "string" || typeof packageValue.name !== "string" || !Array.isArray(packageValue.versions)) continue;
    const key = `${packageValue.owner}/${packageValue.name}`.toLocaleLowerCase("en-US");
    const versions = packageValue.versions.flatMap((version) => {
      if (typeof version !== "object" || version === null) return [];
      const versionValue = version as ThunderstorePackageVersionLike;
      return typeof versionValue.version_number === "string" && versionValue.is_active !== false ? [versionValue.version_number] : [];
    });
    result.set(key, versions);
  }
  return result;
}

export function updateCandidatesForCommunity(
  installed: readonly InstalledThunderstoreMod[],
  versions: ReadonlyMap<string, readonly string[]>,
): UpdateCandidate[] {
  return installed.map((mod) => updateCandidate(mod, versions.get(`${mod.identity.namespace}/${mod.identity.name}`.toLocaleLowerCase("en-US"))));
}

export function updateCandidate(
  installed: InstalledThunderstoreMod,
  availableVersions: readonly string[] | undefined,
): UpdateCandidate {
  const currentVersion = installed.installedVersion;
  if (installed.pinned) {
    return { ...installed, currentVersion, newestVersion: undefined, state: "pinned" };
  }
  if (installed.ignored || installed.updateBlocked) {
    return { ...installed, currentVersion, newestVersion: undefined, state: "ignored" };
  }
  if (availableVersions === undefined) {
    return { ...installed, currentVersion, newestVersion: undefined, state: "unavailable" };
  }
  const newest = availableVersions.reduce<string | undefined>((best, candidate) => {
    if (best === undefined || compareVersions(candidate, best) > 0) return candidate;
    return best;
  }, undefined);
  if (newest === undefined) return { ...installed, currentVersion, state: "unavailable" };
  return {
    ...installed,
    currentVersion,
    newestVersion: newest,
    state: compareVersions(newest, installed.installedVersion) > 0 ? "update" : "current",
  };
}
