export const THUNDERSTORE_SOURCE = "thunderstore" as const;

export type MappingStatus =
  | "verified"
  | "ambiguous"
  | "no-nexus-match"
  | "no-vortex-support"
  | "unsupported-layout"
  | "retired"
  | "excluded-non-game";

export type Capability =
  | "browse"
  | "download"
  | "install"
  | "dependencies"
  | "updates"
  | "modpacks"
  | "profileConfig"
  | "launch"
  | "server";

export interface AdapterBinding {
  id: string;
  version: string;
  loader: "bepinex" | "melonloader" | "game-native" | "other";
  archivePrefixes: string[];
  allowedStandaloneFiles?: string[];
  supportedArchitectures?: string[];
  supportedOperatingSystems?: string[];
}

export interface CatalogEntry {
  mappingKey: string;
  ecosystemId?: string;
  community: string;
  name: string;
  aliases?: string[];
  nexusDomain?: string;
  nexusGameId?: number;
  vortexGameIds: string[];
  storeIds?: Record<string, string[]>;
  variant?: string;
  edition?: string;
  status: MappingStatus;
  capabilities: readonly Capability[];
  mappingVersion: string;
  adapter?: AdapterBinding;
  evidence: readonly string[];
  reviewedAt: string;
  reviewer: string;
}

export interface CatalogSnapshot {
  schemaVersion: 1;
  snapshotId: string;
  generatedAt: string;
  entries: CatalogEntry[];
}

export interface PackageIdentity {
  repository: typeof THUNDERSTORE_SOURCE;
  namespace: string;
  name: string;
  packageUuid?: string;
}

export interface VersionIdentity {
  package: PackageIdentity;
  version: string;
  versionUuid?: string;
}

export interface ListingIdentity {
  version: VersionIdentity;
  community: string;
}

export interface DependencyDeclaration {
  raw: string;
  namespace: string;
  packageName: string;
  version: string;
  community?: string;
}

export interface ThunderstoreVersionRecord {
  identity: VersionIdentity;
  listing: ListingIdentity;
  description?: string;
  author?: string;
  websiteUrl?: string;
  iconUrl?: string;
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  dependencies: DependencyDeclaration[];
  dependenciesComplete: boolean;
  isActive: boolean;
  isDeprecated?: boolean;
  categories?: string[];
  publishedAt?: string;
  raw?: unknown;
}

export interface ThunderstoreModMetadata {
  schemaVersion: 1;
  source: typeof THUNDERSTORE_SOURCE;
  community: string;
  namespace: string;
  packageName: string;
  packageUuid?: string;
  version: string;
  versionUuid?: string;
  description?: string;
  author?: string;
  websiteUrl?: string;
  iconUrl?: string;
  category?: string;
  vortexGameId: string;
  mappingVersion: string;
  adapterVersion?: string;
  dependencies: string[];
  provenance: "api-and-archive-verified" | "import-confirmed" | "manual" | "unconfirmed";
  archiveSha256?: string;
  originalDownloadUrl?: string;
  policy: "exact" | "approved-override" | "locked";
}

export interface OperationContext {
  operationId: string;
  resourceKey: string;
  vortexGameId: string;
  profileId?: string;
  community: string;
  mappingKey: string;
  mappingVersion: string;
  adapterId?: string;
  adapterVersion?: string;
  generation: number;
  createdAt: string;
}

export interface HostContextSnapshot {
  vortexGameId: string;
  profileId?: string;
  generation: number;
  mappingVersion: string;
  adapterVersion?: string;
}

export interface DependencyNode {
  key: string;
  identity: PackageIdentity;
  version: string;
  community: string;
  parents: string[];
}

export interface DependencyPlan {
  complete: boolean;
  nodes: DependencyNode[];
  edges: Array<{ from: string; to: string; raw: string }>;
  missing: DependencyDeclaration[];
  conflicts: Array<{ identity: PackageIdentity; versions: string[]; parents: string[] }>;
  cycles: string[][];
}

export type UpdatePolicy = "manual" | "notify" | "automatic";

export interface InstalledThunderstoreMod {
  modId: string;
  identity: PackageIdentity;
  community: string;
  vortexGameId: string;
  installedVersion: string;
  pinned?: boolean;
  ignored?: boolean;
  updateBlocked?: boolean;
}

export interface UpdateCandidate {
  modId: string;
  identity: PackageIdentity;
  currentVersion: string;
  newestVersion?: string;
  state: "update" | "current" | "pinned" | "ignored" | "unavailable" | "error";
}
