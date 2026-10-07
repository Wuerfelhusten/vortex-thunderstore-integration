import { GameCatalog } from "../../src/catalog";
import { parseDependency } from "../../src/dependencies";
import { packageIdentity, versionIdentity } from "../../src/identity";
import { CatalogEntry, ThunderstoreVersionRecord } from "../../src/types";

export const valheimEntry: CatalogEntry = {
  mappingKey: "valheim", community: "valheim", name: "Valheim", vortexGameIds: ["valheim"],
  nexusDomain: "valheim", nexusGameId: 3667, status: "verified", capabilities: ["install", "download", "browse", "updates"],
  mappingVersion: "1", evidence: [], reviewedAt: "test", reviewer: "test",
  adapter: { id: "valheim-bepinex", version: "1", loader: "bepinex", archivePrefixes: ["BepInEx"] },
};
export function testCatalog(): GameCatalog {
  return new GameCatalog({ schemaVersion: 1, snapshotId: "test", generatedAt: "test", entries: [valheimEntry] });
}
export function record(name: string, version = "1.0.0", deps: string[] = [], namespace = "Author"): ThunderstoreVersionRecord {
  const identity = versionIdentity(packageIdentity(namespace, name), version);
  return { identity, listing: { version: identity, community: "valheim" },
    downloadUrl: "https://gcdn.thunderstore.io/test.zip", fileName: `${name}.zip`, fileSize: 10,
    dependencies: deps.map((d) => parseDependency(d, "valheim")), dependenciesComplete: true, isActive: true };
}
