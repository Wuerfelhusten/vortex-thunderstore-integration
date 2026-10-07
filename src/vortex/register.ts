import { types, util } from "@nexusmods/vortex-api";
import { GameCatalog } from "../catalog";
import { ThunderstoreApiClient } from "../api";
import { extractThunderstoreAttributes, toVortexLookup } from "../metadata";
import { resolveRor2mmInstallLink } from "../protocols";
import { THUNDERSTORE_SOURCE } from "../types";
import { ThunderstorePage } from "../ui/ThunderstorePage";
import { installedThunderstoreMods } from "../updates";
import { THUNDERSTORE_ICON_NAME, THUNDERSTORE_ICON_FILE, THUNDERSTORE_ICON_PATH } from "./icons";
import { activeGameId } from "./game-context";
import { canOpenThunderstore, openThunderstore } from "./mod-actions";
import { loadVersionRecord } from "./package-records";
import { installThunderstorePackage } from "./install-package";
import { registerInstallers } from "./installers";
import { registerUpdateEvents } from "./update-events";
import { registerModpackInstaller } from "./modpack-installer";
import { migrateThunderstoreState } from "./migrations";
import type { ThunderstoreRepositoryId } from "./contracts";

export function registerVortexBridge(context: types.IExtensionContext, catalog: GameCatalog, client: ThunderstoreApiClient): void {
  const api = context.api;
  const showPage = () => api.events.emit("show-main-page", "thunderstore");
  const readyForBrowse = () => {
    const gameId = activeGameId(api);
    if (gameId === undefined) return false;
    const resolution = catalog.resolve(gameId);
    return resolution.kind === "resolved"
      && resolution.entry.status === "verified"
      && resolution.entry.capabilities.includes("browse");
  };

  context.registerModSource(THUNDERSTORE_SOURCE, "Thunderstore", showPage, {
    icon: THUNDERSTORE_ICON_NAME,
    condition: readyForBrowse,
    supportsModId: true,
  });
  // Host merges descending priorities: run after its standard extractors,
  // but before priority 25, which preserves user-provided custom attributes.
  context.registerAttributeExtractor(26, async (modInfo: unknown) => extractThunderstoreAttributes(modInfo));
  context.registerDownloadProtocol("ror2mm", (inputUrl) => resolveRor2mmInstallLink(inputUrl, client));
  // Match Vortex's native "Open on Nexus Mods" action. This group is the
  // context menu opened from a mod row; the multi-row action group is a
  // separate surface and does not make the action appear in that menu.
  context.registerAction(
    "mods-action-icons",
    999,
    THUNDERSTORE_ICON_NAME,
    {},
    "Open on Thunderstore",
    (instanceIds) => openThunderstore(api, catalog, instanceIds),
    (instanceIds) => canOpenThunderstore(api, catalog, instanceIds),
  );
  // Repository lookups access the fully initialized Vortex API. Vortex 2.x
  // rejects this registration while the extension init phase is still running.
  context.once(() => {
    migrateThunderstoreState(api);
    void util.installIconSet(THUNDERSTORE_ICON_NAME, THUNDERSTORE_ICON_FILE).catch(() => undefined);
    api.registerRepositoryLookup(THUNDERSTORE_SOURCE, true, async (id) => {
      if (!id.gameId || !id.modId || !id.fileId) return [];
      const resolution = catalog.resolve(id.gameId);
      if (resolution.kind !== "resolved" || !resolution.entry.capabilities.includes("download")) return [];
      const [namespace, ...packageParts] = id.modId.split("/");
      const name = packageParts.join("/");
      if (!namespace || !name) return [];
      const record = await loadVersionRecord(client, namespace, name, id.fileId, resolution.entry.community);
      if (record === undefined) return [];
      const lookup = toVortexLookup(record, resolution.entry, id.gameId);
      // The modpack root already lists the complete, resolved graph. Vortex
      // recursively gathers lookup rules, so expanding members again would
      // reintroduce the overridden transitive versions.
      if ((id as unknown as ThunderstoreRepositoryId).thunderstoreModpackMember === true) lookup.value.rules = [];
      return [lookup as any];
    });
  });

  registerInstallers(context, catalog);
  registerModpackInstaller(context, catalog);

  context.registerMainPage(THUNDERSTORE_ICON_NAME, "Browse Thunderstore", ThunderstorePage, {
    id: "thunderstore",
    group: "per-game",
    mdi: THUNDERSTORE_ICON_PATH,
    visible: readyForBrowse,
    props: () => ({
      catalog,
      client,
      getActiveGameId: () => activeGameId(api),
      getInstalledPackageKeys: () => new Set(
        (() => {
          const gameId = activeGameId(api);
          return gameId === undefined ? [] : installedThunderstoreMods(api.getState(), gameId)
            .map((mod) => `${mod.identity.namespace}/${mod.identity.name}`.toLocaleLowerCase("en-US"));
        })(),
      ),
      installPackage: (namespace: string, name: string, version: string, isModpack?: boolean) =>
        installThunderstorePackage(api, client, catalog, namespace, name, version, isModpack),
    }),
    priority: 250,
  });

  registerUpdateEvents(context, catalog, client);
}
