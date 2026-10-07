import { actions, types, util } from "@nexusmods/vortex-api";
import { ThunderstoreApiClient } from "../api";
import { GameCatalog } from "../catalog";
import { TtlCache } from "../cache";
import { THUNDERSTORE_SOURCE } from "../types";
import { indexCommunityVersions, installedThunderstoreMods, updateCandidatesForCommunity } from "../updates";
import { installThunderstorePackage } from "./install-package";
import { thunderstorePackageUrlFor } from "./mod-actions";

export function registerUpdateEvents(context: types.IExtensionContext, catalog: GameCatalog, client: ThunderstoreApiClient): void {
  const api = context.api;
  const communityPackageCache = new TtlCache<unknown[]>();
  const modStateAttributes = (gameId: string, instanceId: string): Record<string, unknown> => {
    const state = api.getState() as unknown as {
      persistent?: {
        mods?: Record<string, Record<string, { attributes?: Record<string, unknown> }>>;
      };
    };
    return state.persistent?.mods?.[gameId]?.[instanceId]?.attributes ?? {};
  };

  const eventModIds = (value: unknown): Set<string> | undefined => {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) {
      return new Set(value.filter((item): item is string => typeof item === "string"));
    }
    if (typeof value === "object") return new Set(Object.keys(value));
    return undefined;
  };

  const installedThunderstoreModForEvent = (gameId: string, identifier: string) => {
    const installed = installedThunderstoreMods(api.getState(), gameId);
    return installed.find((mod) => {
      if (mod.modId === identifier) return true;
      const attributes = modStateAttributes(gameId, mod.modId);
      return attributes.modId === identifier
        || `${(attributes.thunderstore as { namespace?: unknown } | undefined)?.namespace ?? ""}/${(attributes.thunderstore as { packageName?: unknown } | undefined)?.packageName ?? ""}` === identifier;
    });
  };

  const checkThunderstoreVersions = async (gameId: string, modsValue?: unknown, forceFull = false): Promise<string[]> => {
    const resolution = catalog.resolve(gameId);
    if (resolution.kind !== "resolved" || !resolution.entry.capabilities.includes("updates")) return [];
    const requestedIds = eventModIds(modsValue);
    const installed = installedThunderstoreMods(api.getState(), gameId)
      .filter((mod) => requestedIds === undefined || requestedIds.has(mod.modId));
    if (installed.length === 0) return [];

    try {
      const community = resolution.entry.community;
      const cacheKey = `community:${community}`;
      let packages = forceFull ? undefined : communityPackageCache.get(cacheKey);
      if (packages === undefined) {
        packages = await client.getCommunityPackages(community);
        communityPackageCache.set(cacheKey, packages, 5 * 60 * 1000);
      }
      const candidates = updateCandidatesForCommunity(installed, indexCommunityVersions(packages));
      for (const candidate of candidates) {
        if (candidate.state !== "update" && candidate.state !== "current") continue;
        const version = candidate.state === "update" ? candidate.newestVersion : candidate.currentVersion;
        if (version === undefined) continue;
        api.store?.dispatch(actions.setModAttribute(gameId, candidate.modId, "newestVersion", version));
        const fileId = candidate.state === "current" ? modStateAttributes(gameId, candidate.modId).fileId ?? version : version;
        api.store?.dispatch(actions.setModAttribute(gameId, candidate.modId, "newestFileId", fileId));
      }
      return candidates.filter((candidate) => candidate.state === "update").map((candidate) => candidate.modId);
    } catch (error) {
      api.sendNotification?.({
        id: `thunderstore-${resolution.entry.community}-update-check-failed`,
        type: "error",
        message: `Thunderstore-Updatecheck für ${resolution.entry.name} fehlgeschlagen: ${String(error)}`,
        displayMS: 8000,
      });
      return [];
    }
  };

  const updateThunderstoreMod = async (gameId: string, identifier: string, requestedVersion?: unknown): Promise<void> => {
    const installed = installedThunderstoreModForEvent(gameId, identifier);
    if (installed === undefined) return;
    const attributes = modStateAttributes(gameId, installed.modId);
    const version = typeof requestedVersion === "string" && requestedVersion.length > 0
      ? requestedVersion
      : typeof attributes.newestVersion === "string" ? attributes.newestVersion : undefined;
    if (version === undefined || version === installed.installedVersion) return;
    try {
      await installThunderstorePackage(
        api,
        client,
        catalog,
        installed.identity.namespace,
        installed.identity.name,
        version,
        false,
        gameId,
      );
    } catch (error) {
      api.sendNotification?.({
        id: `thunderstore-${installed.modId}-update-failed`,
        type: "error",
        message: `Update von ${installed.identity.namespace}/${installed.identity.name} auf ${version} fehlgeschlagen: ${String(error)}`,
        displayMS: 8000,
      });
    }
  };

  context.once(() => {
    api.onAsync("check-mods-version", async (gameId: unknown, modsValue?: unknown, forceFull?: unknown) => {
      if (typeof gameId !== "string") return [];
      return checkThunderstoreVersions(gameId, modsValue, forceFull === true);
    });

    api.events.on("mod-update", (gameId: unknown, modId: unknown, fileId: unknown, source?: unknown) => {
      if (typeof gameId !== "string" || typeof modId !== "string") return;
      if (source !== THUNDERSTORE_SOURCE) return;
      void updateThunderstoreMod(gameId, modId, fileId);
    });

    api.events.on("mods-update", async (gameId: unknown, modIds: unknown) => {
      if (typeof gameId !== "string") return;
      const ids = eventModIds(modIds);
      if (ids === undefined) return;
      for (const modId of ids) await updateThunderstoreMod(gameId, modId);
    });

    api.events.on("open-mod-page", (gameId: unknown, modId: unknown, source?: unknown) => {
      if (typeof gameId !== "string" || typeof modId !== "string" || source !== THUNDERSTORE_SOURCE) return;
      const installed = installedThunderstoreModForEvent(gameId, modId);
      if (installed === undefined) return;
      void util.opn(thunderstorePackageUrlFor(installed.community, installed.identity.namespace, installed.identity.name)).catch(() => undefined);
    });
  });
}
