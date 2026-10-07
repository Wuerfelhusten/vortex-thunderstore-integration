import type { types } from "@nexusmods/vortex-api";

// The published host types lag behind the runtime. Keep extensions to those
// contracts here rather than scattering casts through installation code.
export interface ThunderstoreRepositoryId {
  repository: "thunderstore";
  gameId: string;
  modId: string;
  fileId: string;
  thunderstoreModpackMember?: boolean;
}

export interface ThunderstoreRule {
  type: "requires";
  reference: {
    id?: string;
    gameId: string;
    logicalFileName: string;
    versionMatch?: string;
    repo: ThunderstoreRepositoryId;
  };
  extra: { community: string; version: string };
}

export type HostRule = types.IModRule & {
  type?: string;
  reference: types.IModRule["reference"] & { gameId?: string; logicalFileName?: string };
};

export function asHostRule(rule: ThunderstoreRule): types.IModRule {
  return rule as unknown as types.IModRule;
}

export interface InstallDownloadOptions {
  allowAutoEnable: boolean;
  profileId: string;
  forceInstaller?: string;
}

/** Known host wrappers; leaf values stay unknown until runtime validation. */
export interface MetadataEnvelope {
  source?: unknown;
  thunderstore?: unknown;
  meta?: MetadataEnvelope;
  download?: { modInfo?: MetadataEnvelope };
  details?: Record<string, unknown>;
  pictureUrl?: unknown;
}
