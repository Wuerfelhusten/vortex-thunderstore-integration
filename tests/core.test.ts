import { describe, expect, it } from "vitest";
import { GameCatalog } from "../src/catalog";
import { assertContextCurrent, createOperationContext } from "../src/context";
import { parseDependency, planDependencies } from "../src/dependencies";
import { packageIdentity, versionIdentity } from "../src/identity";
import { buildInstallInstructions } from "../src/installer";
import { parseRor2mmInstallLink } from "../src/protocols";
import { UnsafeInputError, validateArchiveEntries, validateRemoteUrl } from "../src/security";
import { compareVersions } from "../src/versions";
import { ThunderstoreVersionRecord } from "../src/types";
import { buildValheimInstallInstructions, isValheimLoaderArchive, supportsValheimArchive } from "../src/valheim";
import { indexCommunityVersions, installedThunderstoreMods, updateCandidatesForCommunity } from "../src/updates";
import { extractThunderstoreAttributes, toVortexLookup } from "../src/metadata";

const entry = {
  mappingKey: "test-game",
  community: "test-game",
  name: "Test Game",
  nexusDomain: "test-game",
  nexusGameId: 1,
  vortexGameIds: ["test"],
  status: "verified" as const,
  capabilities: ["browse", "download", "install", "dependencies", "updates"] as const,
  mappingVersion: "1.0.0",
  adapter: { id: "test-root", version: "1.0.0", loader: "bepinex" as const, archivePrefixes: ["BepInEx/plugins"] },
  evidence: ["fixture"],
  reviewedAt: "2026-09-18T00:00:00.000Z",
  reviewer: "test",
};

function record(namespace: string, name: string, version: string, dependencies: string[] = []): ThunderstoreVersionRecord {
  const pkg = packageIdentity(namespace, name);
  const ver = versionIdentity(pkg, version);
  return {
    identity: ver,
    listing: { version: ver, community: "test-game" },
    downloadUrl: "https://gcdn.thunderstore.io/test.zip",
    fileName: "test.zip",
    fileSize: 1,
    dependencies: dependencies.map((raw) => parseDependency(raw, "test-game")),
    dependenciesComplete: true,
    isActive: true,
  };
}

describe("catalog and contexts", () => {
  it("does not resolve an unlisted game by name similarity", () => {
    const catalog = new GameCatalog({ schemaVersion: 1, snapshotId: "test", generatedAt: "now", entries: [entry] });
    expect(catalog.resolve("test-game").kind).toBe("unmapped");
    expect(catalog.resolve("test").kind).toBe("resolved");
  });

  it("rejects a changed operation target", () => {
    const operation = createOperationContext({ operationId: "op", resourceKey: "thunderstore:test/pkg", vortexGameId: "test", profileId: "p1", community: "test-game", mappingKey: "test-game", mappingVersion: "1", generation: 1 });
    expect(() => assertContextCurrent(operation, { vortexGameId: "other", profileId: "p1", mappingVersion: "1", generation: 1 })).toThrow("TARGET_CHANGED");
  });
});

describe("dependency planner", () => {
  it("plans the complete graph and reports exact conflicts", async () => {
    const root = record("a", "root", "1.0.0", ["b-lib-1.0.0", "c-addon-1.0.0"]);
    const versions = new Map([
      ["b-lib-1.0.0", record("b", "lib", "1.0.0", ["shared-lib-1.0.0"])],
      ["c-addon-1.0.0", record("c", "addon", "1.0.0", ["shared-lib-2.0.0"])],
      ["shared-lib-1.0.0", record("shared", "lib", "1.0.0")],
      ["shared-lib-2.0.0", record("shared", "lib", "2.0.0")],
    ]);
    const plan = await planDependencies(root, { getVersion: async (dependency) => versions.get(dependency.raw) });
    expect(plan.complete).toBe(false);
    expect(plan.conflicts[0]?.versions.sort()).toEqual(["1.0.0", "2.0.0"]);
  });
});

describe("security and installer", () => {
  it("rejects traversal and case collisions", () => {
    expect(() => validateArchiveEntries([{ path: "../evil.dll", kind: "file", compressedSize: 1, uncompressedSize: 1 }])).toThrow(UnsafeInputError);
    expect(() => validateArchiveEntries([
      { path: "BepInEx/plugins/A.dll", kind: "file", compressedSize: 1, uncompressedSize: 1 },
      { path: "bepinex/plugins/a.dll", kind: "file", compressedSize: 1, uncompressedSize: 1 },
    ])).toThrow(UnsafeInputError);
  });

  it("only emits instructions inside the declared adapter root", () => {
    expect(buildInstallInstructions(["BepInEx/plugins/A.dll"], "test", entry)).toEqual([
      { type: "copy", source: "BepInEx/plugins/A.dll", destination: "BepInEx/plugins/A.dll" },
    ]);
    expect(() => buildInstallInstructions(["plugins/A.dll"], "test", entry)).toThrow(UnsafeInputError);
  });

  it("allowlists downloads and rejects credentialed or foreign URLs", () => {
    expect(validateRemoteUrl("https://gcdn.thunderstore.io/a.zip", ["gcdn.thunderstore.io"]).hostname).toBe("gcdn.thunderstore.io");
    expect(() => validateRemoteUrl("https://user:pass@gcdn.thunderstore.io/a.zip", ["gcdn.thunderstore.io"])).toThrow(UnsafeInputError);
    expect(() => validateRemoteUrl("https://evil.example/a.zip", ["gcdn.thunderstore.io"])).toThrow(UnsafeInputError);
  });

  it("maps a Valheim Thunderstore plugin package into the existing BepInEx game root", () => {
    const files = [
      "Package/manifest.json",
      "Package/README.md",
      "Package/plugins/TestMod/TestMod.dll",
      "Package/config/TestMod.cfg",
    ];
    expect(supportsValheimArchive(files)).toBe(true);
    expect(buildValheimInstallInstructions(files)).toEqual([
      { type: "copy", source: "Package/plugins/TestMod/TestMod.dll", destination: "BepInEx/plugins/TestMod/TestMod.dll" },
      { type: "copy", source: "Package/config/TestMod.cfg", destination: "BepInEx/config/TestMod.cfg" },
    ]);
  });

  it("delegates the Valheim loader pack to the installed Valheim extension", () => {
    const files = [
      "BepInExPack_Valheim/manifest.json",
      "BepInExPack_Valheim/BepInEx/core/BepInEx.dll",
      "BepInExPack_Valheim/winhttp.dll",
    ];
    expect(isValheimLoaderArchive(files)).toBe(true);
    expect(supportsValheimArchive(files)).toBe(false);
  });

  it("maps the loose DLL layout used by common Valheim packages", () => {
    expect(buildValheimInstallInstructions([
      "manifest.json",
      "ValheimHDTerrain.dll",
      "HDTerrainData/TerrainConfig.json",
    ])).toEqual([
      { type: "copy", source: "ValheimHDTerrain.dll", destination: "BepInEx/plugins/ValheimHDTerrain/ValheimHDTerrain.dll" },
      { type: "copy", source: "HDTerrainData/TerrainConfig.json", destination: "BepInEx/plugins/ValheimHDTerrain/HDTerrainData/TerrainConfig.json" },
    ]);
  });

  it("keeps the Thunderstore identity in Vortex lookup metadata", () => {
    const lookup = toVortexLookup({
      ...record("author", "ModA", "1.2.3", ["dep-lib-2.0.0"]),
      description: "A test Thunderstore mod",
      author: "Author Team",
      websiteUrl: "https://thunderstore.io/c/test-game/p/author/ModA/",
      categories: ["Utilities"],
      iconUrl: "https://gcdn.thunderstore.io/icon.png",
    }, {
      ...entry,
      mappingKey: "valheim",
      community: "valheim",
      vortexGameIds: ["valheim"],
      adapter: undefined,
    }, "valheim");
    expect(lookup.value.meta?.thunderstore).toMatchObject({
      source: "thunderstore",
      namespace: "author",
      packageName: "ModA",
      version: "1.2.3",
      vortexGameId: "valheim",
      description: "A test Thunderstore mod",
      author: "Author Team",
      websiteUrl: "https://thunderstore.io/c/test-game/p/author/ModA/",
      category: "Utilities",
      iconUrl: "https://gcdn.thunderstore.io/icon.png",
    });
    expect(lookup.value).toMatchObject({
      modName: "ModA",
      modId: "author/ModA",
      fileId: "1.2.3",
      pictureUrl: "https://gcdn.thunderstore.io/icon.png",
      details: { category: "Utilities" },
    });
    expect(lookup.value.rules).toEqual([expect.objectContaining({
      type: "requires",
      reference: expect.objectContaining({
        gameId: "valheim",
        repo: expect.objectContaining({ repository: "thunderstore", modId: "dep/lib", fileId: "2.0.0" }),
      }),
    })]);
  });

  it("emits Vortex identification attributes from persisted Thunderstore metadata", () => {
    const attributes = extractThunderstoreAttributes({
      meta: {
        thunderstore: {
          source: "thunderstore",
          namespace: "author",
          packageName: "ModA",
          version: "1.2.3",
          category: "Utilities",
        },
      },
    });
    expect(attributes).toMatchObject({
      source: "thunderstore",
      modId: "author/ModA",
      fileId: "1.2.3",
      details: { modId: "author/ModA", fileId: "1.2.3", category: "Utilities" },
    });
  });
});

describe("version and protocol parsing", () => {
  it("compares semantic versions numerically", () => {
    expect(compareVersions("1.0.10", "1.0.2")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0);
  });

  it("requires an exact version in the r2modman link", () => {
    expect(parseRor2mmInstallLink("ror2mm://v1/install/ns/pkg?version=1.2.3")).toEqual({ namespace: "ns", packageName: "pkg", version: "1.2.3" });
    expect(parseRor2mmInstallLink("ror2mm://v1/install/https://thunderstore.io/ns/pkg/1.2.3/")).toEqual({ namespace: "ns", packageName: "pkg", version: "1.2.3" });
    expect(() => parseRor2mmInstallLink("ror2mm://v1/install/ns/pkg")).toThrow(UnsafeInputError);
  });
});

describe("Valheim update metadata", () => {
  it("reads Thunderstore metadata from Vortex state and finds exact newer versions", () => {
    const state = {
      persistent: {
        mods: {
          valheim: {
            "mod-a": {
              attributes: {
                thunderstore: {
                  source: "thunderstore",
                  namespace: "author",
                  packageName: "ModA",
                  community: "valheim",
                  version: "1.0.0",
                  vortexGameId: "valheim",
                },
              },
            },
          },
        },
      },
    };
    const installed = installedThunderstoreMods(state, "valheim");
    const versions = indexCommunityVersions([{
      owner: "author",
      name: "ModA",
      versions: [{ version_number: "1.0.0", is_active: true }, { version_number: "1.1.0", is_active: true }],
    }]);
    expect(updateCandidatesForCommunity(installed, versions)[0]).toMatchObject({ state: "update", newestVersion: "1.1.0" });
  });
});
