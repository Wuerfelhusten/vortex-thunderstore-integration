import { packageKey, versionKey } from "./identity";
import { CatalogEntry, PackageIdentity, ThunderstoreModMetadata, ThunderstoreVersionRecord } from "./types";
import type { MetadataEnvelope, ThunderstoreRule } from "./vortex/contracts";

export interface VortexLookupData {
  fileName: string;
  fileSizeBytes: number;
  gameId: string;
  domainName?: string;
  /** Native Vortex uses this image for the mod row/detail views. */
  pictureUrl?: string;
  /** Keep a human-readable package name beside the archive file name. */
  name?: string;
  modName?: string;
  version?: string;
  modVersion?: string;
  author?: string;
  description?: string;
  homepage?: string;
  category?: string;
  modId?: string;
  fileId?: string;
  fileSize?: number;
  logicalFileName: string;
  fileVersion: string;
  sourceURI: string;
  source: "thunderstore";
  meta?: {
    thunderstore: ThunderstoreModMetadata;
  };
  rules?: ThunderstoreRule[];
  details: {
    homepage?: string;
    description?: string;
    author?: string;
    modId: string;
    fileId: string;
    category?: string;
  };
}

export function toMetadata(
  record: ThunderstoreVersionRecord,
  entry: CatalogEntry,
  gameId: string,
  archiveSha256?: string,
): ThunderstoreModMetadata {
  return {
    schemaVersion: 1,
    source: "thunderstore",
    community: record.listing.community,
    namespace: record.identity.package.namespace,
    packageName: record.identity.package.name,
    ...(record.identity.package.packageUuid === undefined ? {} : { packageUuid: record.identity.package.packageUuid }),
    version: record.identity.version,
    ...(record.identity.versionUuid === undefined ? {} : { versionUuid: record.identity.versionUuid }),
    ...(record.description === undefined ? {} : { description: record.description }),
    ...(record.author === undefined ? {} : { author: record.author }),
    ...(record.websiteUrl === undefined ? {} : { websiteUrl: record.websiteUrl }),
    ...(record.iconUrl === undefined ? {} : { iconUrl: record.iconUrl }),
    ...(record.categories?.[0] === undefined ? {} : { category: record.categories[0] }),
    vortexGameId: gameId,
    mappingVersion: entry.mappingVersion,
    ...(entry.adapter === undefined ? {} : { adapterVersion: entry.adapter.version }),
    dependencies: record.dependencies.map((dependency) => dependency.raw),
    provenance: archiveSha256 === undefined ? "unconfirmed" : "api-and-archive-verified",
    ...(archiveSha256 === undefined ? {} : { archiveSha256 }),
    originalDownloadUrl: record.downloadUrl,
    policy: "exact",
  };
}

export function toVortexLookup(record: ThunderstoreVersionRecord, entry: CatalogEntry, gameId: string): { key: string; value: VortexLookupData } {
  const identity = record.identity.package;
  const packageRef = `${identity.namespace}/${identity.name}`;
  const metadata = toMetadata(record, entry, gameId);
  return {
    key: `${versionKey(record.identity)}:${gameId}`,
    value: {
      fileName: record.fileName,
      fileSizeBytes: record.fileSize,
      fileSize: record.fileSize,
      gameId,
      ...(entry.nexusDomain === undefined ? {} : { domainName: entry.nexusDomain }),
      ...(record.iconUrl === undefined ? {} : { pictureUrl: record.iconUrl }),
      ...(record.author === undefined ? {} : { author: record.author }),
      ...(record.description === undefined ? {} : { description: record.description }),
      ...(record.websiteUrl === undefined ? {} : { homepage: record.websiteUrl }),
      ...(record.categories?.[0] === undefined ? {} : { category: record.categories[0] }),
      modId: packageRef,
      fileId: record.identity.version,
      name: identity.name,
      modName: identity.name,
      logicalFileName: packageRef,
      fileVersion: record.identity.version,
      version: record.identity.version,
      modVersion: record.identity.version,
      sourceURI: record.downloadUrl,
      source: "thunderstore",
      meta: { thunderstore: metadata },
      rules: record.dependencies.map((dependency) => {
        const packageRef = `${dependency.namespace}/${dependency.packageName}`;
        const community = dependency.community ?? record.listing.community;
        return {
          type: "requires",
          reference: {
            // `id` means a local Vortex installation ID, NOT a repository
            // package ID. Use repo identifiers for portable dependencies.
            gameId,
            logicalFileName: packageRef,
            repo: {
              repository: "thunderstore",
              gameId,
              modId: packageRef,
              fileId: dependency.version,
            },
          },
          extra: { community, version: dependency.version },
        };
      }),
      details: {
        homepage: record.websiteUrl,
        description: record.description,
        author: record.author,
        modId: packageRef,
        fileId: record.identity.version,
        category: record.categories?.[0],
      },
    },
  };
}

export function extractThunderstoreAttributes(modInfo: unknown): Record<string, unknown> {
  if (typeof modInfo !== "object" || modInfo === null) return {};
  const outer = modInfo as MetadataEnvelope;
  const downloadInfo = outer.download?.modInfo;
  if ((outer.source !== undefined && outer.source !== "thunderstore")
    || (downloadInfo?.source !== undefined && downloadInfo.source !== "thunderstore")) return {};
  // Direct download: modInfo.meta.thunderstore. Native dependency download:
  // fullInfo.download.modInfo.meta = the entire repository lookup value.
  const candidates = [downloadInfo?.meta, downloadInfo, outer.meta, outer];
  const input = candidates.find((candidate) => {
    const value = candidate?.meta?.thunderstore;
    return typeof value === "object" && value !== null && "source" in value && value.source === "thunderstore";
  });
  if (input === undefined) return {};
  const metadata = input.meta?.thunderstore;
  if (typeof metadata !== "object" || metadata === null) return {};
  const value = metadata as Partial<ThunderstoreModMetadata>;
  if (value.source !== "thunderstore" || typeof value.namespace !== "string" || !value.namespace
    || typeof value.packageName !== "string" || !value.packageName || typeof value.version !== "string" || !value.version) return {};
  const modId = `${value.namespace}/${value.packageName}`;
  return {
    source: "thunderstore",
    thunderstore: value,
    modId,
    fileId: value.version,
    name: value.packageName,
    customFileName: value.packageName,
    modName: value.packageName,
    version: value.version,
    modVersion: value.version,
    ...(typeof value.author === "string" ? { author: value.author } : typeof input.details?.author === "string" ? { author: input.details.author } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : typeof input.details?.description === "string" ? { description: input.details.description } : {}),
    ...(typeof value.websiteUrl === "string" ? { homepage: value.websiteUrl } : typeof input.details?.homepage === "string" ? { homepage: input.details.homepage } : {}),
    ...(typeof value.category === "string" ? { category: value.category } : typeof input.details?.category === "string" ? { category: input.details.category } : {}),
    logicalFileName: modId,
    sourceURI: value.originalDownloadUrl,
    ...(typeof value.iconUrl === "string" ? { pictureUrl: value.iconUrl } : typeof input.pictureUrl === "string" ? { pictureUrl: input.pictureUrl } : {}),
    details: {
      ...(input.details ?? {}),
      modId,
      fileId: value.version,
      ...(typeof value.author === "string" ? { author: value.author } : {}),
      ...(typeof value.websiteUrl === "string" ? { homepage: value.websiteUrl } : {}),
      ...(typeof value.description === "string" ? { description: value.description } : {}),
      ...(typeof value.category === "string" ? { category: value.category } : {}),
    },
  };
}

export function identityForMetadata(metadata: ThunderstoreModMetadata): PackageIdentity {
  return { repository: "thunderstore", namespace: metadata.namespace, name: metadata.packageName, ...(metadata.packageUuid === undefined ? {} : { packageUuid: metadata.packageUuid }) };
}

export function metadataKey(metadata: ThunderstoreModMetadata): string {
  return `${packageKey(identityForMetadata(metadata))}:${metadata.version}:${metadata.community}:${metadata.vortexGameId}`;
}
