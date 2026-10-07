import { CatalogEntry, CatalogSnapshot, Capability } from "./types";

export type CatalogResolution =
  | { kind: "unmapped"; gameId: string; community?: string }
  | { kind: "ambiguous"; gameId: string; entries: CatalogEntry[] }
  | { kind: "resolved"; entry: CatalogEntry };

export class GameCatalog {
  private readonly byCommunity = new Map<string, CatalogEntry>();
  private readonly byGame = new Map<string, CatalogEntry[]>();

  constructor(readonly snapshot: CatalogSnapshot) {
    if (snapshot.schemaVersion !== 1) {
      throw new Error(`Unsupported catalog schema: ${String(snapshot.schemaVersion)}`);
    }

    for (const entry of snapshot.entries) {
      if (this.byCommunity.has(entry.community)) {
        throw new Error(`Duplicate community mapping: ${entry.community}`);
      }
      if (!entry.mappingKey || !entry.mappingVersion || !entry.reviewedAt || !entry.reviewer) {
        throw new Error(`Incomplete catalog entry: ${entry.community}`);
      }
      if (entry.status === "verified" && (entry.nexusDomain === undefined || entry.nexusGameId === undefined)) {
        throw new Error(`Verified catalog entry is not dual-platform qualified: ${entry.community}`);
      }
      this.byCommunity.set(entry.community, entry);
      for (const gameId of entry.vortexGameIds) {
        const existing = this.byGame.get(gameId) ?? [];
        existing.push(entry);
        this.byGame.set(gameId, existing);
      }
    }
  }

  all(): readonly CatalogEntry[] {
    return this.snapshot.entries;
  }

  getCommunity(community: string): CatalogEntry | undefined {
    return this.byCommunity.get(community);
  }

  resolve(gameId: string, community?: string): CatalogResolution {
    const entries = (this.byGame.get(gameId) ?? []).filter((entry) =>
      community === undefined ? true : entry.community === community,
    );
    if (entries.length === 0) {
      return { kind: "unmapped", gameId, ...(community === undefined ? {} : { community }) };
    }
    if (entries.length > 1) {
      return { kind: "ambiguous", gameId, entries };
    }
    return { kind: "resolved", entry: entries[0] };
  }

  can(gameId: string, capability: Capability, community?: string): boolean {
    const resolution = this.resolve(gameId, community);
    return resolution.kind === "resolved" && resolution.entry.capabilities.includes(capability);
  }

  statusFor(gameId: string): string {
    const entries = this.byGame.get(gameId) ?? [];
    if (entries.length === 0) return "unmapped";
    if (entries.length > 1) return "ambiguous";
    return entries[0].status;
  }
}
