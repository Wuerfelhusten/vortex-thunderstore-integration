import { types, util } from "@nexusmods/vortex-api";
import { GameCatalog } from "../catalog";
import { THUNDERSTORE_SOURCE, ThunderstoreModMetadata } from "../types";
import { activeGameId } from "./game-context";

function thunderstoreMetadata(value: unknown): ThunderstoreModMetadata | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<ThunderstoreModMetadata>;
  if (candidate.source !== THUNDERSTORE_SOURCE
    || typeof candidate.community !== "string"
    || typeof candidate.namespace !== "string"
    || typeof candidate.packageName !== "string"
    || typeof candidate.version !== "string") return undefined;
  return candidate as ThunderstoreModMetadata;
}

function selectedInstanceIds(instanceIds?: string | string[]): string[] {
  if (instanceIds === undefined) return [];
  return Array.isArray(instanceIds) ? instanceIds : [instanceIds];
}

type ModStateRecord = {
  attributes?: Record<string, unknown>;
};

type DownloadStateRecord = {
  modInfo?: Record<string, unknown>;
};

function modAttributeCandidates(api: types.IExtensionApi, gameId: string, instanceId: string): Array<Record<string, unknown>> {
  const state = api.getState() as unknown as {
    persistent?: {
      mods?: Record<string, Record<string, ModStateRecord>>;
      downloads?: { files?: Record<string, DownloadStateRecord> };
    };
  };
  const modAttributes = state.persistent?.mods?.[gameId]?.[instanceId]?.attributes;
  const downloadInfo = state.persistent?.downloads?.files?.[instanceId]?.modInfo;
  return [modAttributes, downloadInfo].filter((value): value is Record<string, unknown> => value !== undefined);
}

function metadataForMod(api: types.IExtensionApi, catalog: GameCatalog, gameId: string, instanceId: string): ThunderstoreModMetadata | undefined {
  const candidates = modAttributeCandidates(api, gameId, instanceId);
  for (const attributes of candidates) {
    const metadata = thunderstoreMetadata(attributes.thunderstore)
      ?? thunderstoreMetadata((attributes.meta as { thunderstore?: unknown } | undefined)?.thunderstore);
    if (metadata !== undefined) return metadata;
  }

  // Older Thunderstore installs may have the standard Vortex identifiers but
  // not the persisted `meta.thunderstore` object yet. They are still safe to
  // open because this extension only creates these identifiers for Thunderstore.
  const attributes = candidates.find((value) => value.source === THUNDERSTORE_SOURCE);
  if (attributes === undefined || typeof attributes.modId !== "string" || typeof attributes.fileId !== "string") return undefined;
  const [namespace, ...packageParts] = attributes.modId.split("/");
  const packageName = packageParts.join("/");
  if (!namespace || !packageName) return undefined;
  const resolution = catalog.resolve(gameId);
  return {
    schemaVersion: 1,
    source: THUNDERSTORE_SOURCE,
    community: typeof attributes.community === "string"
      ? attributes.community
      : resolution.kind === "resolved" ? resolution.entry.community : gameId,
    namespace,
    packageName,
    version: attributes.fileId,
    vortexGameId: gameId,
    mappingVersion: "legacy",
    dependencies: [],
    provenance: "unconfirmed",
    policy: "exact",
  };
}

function thunderstorePackageUrl(metadata: ThunderstoreModMetadata): string {
  return thunderstorePackageUrlFor(metadata.community, metadata.namespace, metadata.packageName);
}

export function thunderstorePackageUrlFor(community: string, namespace: string, packageName: string): string {
  const segments = [community, namespace, packageName].map((value) => encodeURIComponent(value));
  return `https://thunderstore.io/c/${segments[0]}/p/${segments[1]}/${segments[2]}/`;
}

export function canOpenThunderstore(api: types.IExtensionApi, catalog: GameCatalog, instanceIds?: string | string[]): boolean {
  const gameId = activeGameId(api);
  const ids = selectedInstanceIds(instanceIds);
  if (gameId === undefined || ids.length !== 1) return false;
  const source = modAttributeCandidates(api, gameId, ids[0])
    .some((attributes) => attributes.source === THUNDERSTORE_SOURCE);
  return source && metadataForMod(api, catalog, gameId, ids[0]) !== undefined;
}

export function openThunderstore(api: types.IExtensionApi, catalog: GameCatalog, instanceIds?: string | string[]): void {
  const gameId = activeGameId(api);
  const ids = selectedInstanceIds(instanceIds);
  if (gameId === undefined || ids.length !== 1) return;
  const metadata = metadataForMod(api, catalog, gameId, ids[0]);
  if (metadata === undefined) return;
  void util.opn(thunderstorePackageUrl(metadata)).catch((error: unknown) => {
    api.sendNotification?.({
      id: `thunderstore-open-failed-${ids[0]}`,
      type: "error",
      message: `Thunderstore-Seite konnte nicht geöffnet werden: ${String(error)}`,
      displayMS: 6000,
    });
  });
}
