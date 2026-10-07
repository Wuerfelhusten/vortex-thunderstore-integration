import { describe, expect, it, vi } from "vitest";
import { registerVortexBridge } from "../src/vortex/register";
import { installThunderstorePackage } from "../src/vortex/install-package";
import { toDownloadInfo } from "../src/vortex/downloads";
import { extractThunderstoreAttributes, toVortexLookup } from "../src/metadata";
import { migrateThunderstoreState } from "../src/vortex/migrations";
import { record, testCatalog, valheimEntry } from "./helpers/fixtures";

vi.mock("../src/download-mirror", () => ({ pickThunderstoreMirror: async (url: string) => url }));

// Contract reproduced from Vortex testModReference: a local id constraint is
// checked before an exact repository/file match. This is a host simulation,
// not a substitute for a live Vortex installation test.
function exactHostMatch(mod: any, ref: any) {
  return (ref.id === undefined || ref.id === mod.id)
    && ref.repo.repository === mod.attributes.source
    && ref.repo.modId === mod.attributes.modId
    && ref.repo.fileId === mod.attributes.fileId;
}

describe("repository → download → attributes → dependency contract", () => {
  it("installs through the real bridge and matches dependencies with unrelated local IDs", async () => {
    const state: any = { persistent: { profiles: { p: { id: "p", gameId: "valheim", name: "Test", modState: {} } },
      mods: { valheim: {} }, downloads: { files: {} } }, settings: { profiles: { activeProfileId: "p" } } };
    const once: Array<() => void> = [];
    let repositoryLookup: any;
    let extract: any;
    const client: any = {
      getPackageVersion: async (_namespace: string, name: string) => ({ download_url: `https://gcdn.thunderstore.io/${name}.zip`, file_size: 10 }),
      getFullDependencies: async (_namespace: string, name: string) => name === "Pack" ? ["Author-Member-1.0.0"] : [],
      resolveDownloadUrl: (url: string) => new URL(url),
    };
    const api: any = {
      getState: () => state, onAsync: vi.fn(), sendNotification: vi.fn(),
      showDialog: vi.fn().mockResolvedValue({ action: "Weiter", input: { p: true } }),
      registerRepositoryLookup: (_name: string, _preferred: boolean, callback: any) => { repositoryLookup = callback; },
      store: { dispatch: (action: any) => {
        if (action.type === "addModRule") (state.persistent.mods.valheim[action.modId].rules ??= []).push(action.rule);
        if (action.type === "setModEnabled") state.persistent.profiles[action.profileId].modState[action.modId] = { enabled: action.value };
      } },
      events: { on: vi.fn(), emit: vi.fn((event: string, ...args: any[]) => {
        if (event === "start-download") {
          state.persistent.downloads.files.d = { game: [args[1].game], modInfo: args[1] };
          args[3](null, "d");
        }
        if (event === "start-install-download") {
          expect(args[1]).toMatchObject({ profileId: "p", allowAutoEnable: false });
          state.persistent.mods.valheim.root = { id: "root", state: "installed", attributes: extractThunderstoreAttributes({ download: state.persistent.downloads.files.d }) };
          args[2](null, "root");
        }
        return true;
      }) },
      emitAndAwait: async (_event: string, rootId: string, rules: any[], _recommended: boolean, profileId: string) => {
        expect(profileId).toBe("p"); expect(rootId).toBe("root");
        for (const rule of rules) {
          const [lookup] = await repositoryLookup(rule.reference.repo);
          expect(lookup.value.rules).toEqual([]);
          // Native InstallManager.downloadURL wraps the entire lookup in meta.
          const download = { game: ["valheim"], modInfo: { source: lookup.value.source, name: lookup.value.logicalFileName, meta: lookup.value } };
          const attributes = await extract({ download });
          const mod = { id: "unrelated-local-id", state: "installed", attributes };
          expect(exactHostMatch(mod, rule.reference)).toBe(true);
          expect(exactHostMatch({ ...mod, attributes: { ...attributes, fileId: "2.0.0" } }, rule.reference)).toBe(false);
          expect(exactHostMatch({ ...mod, attributes: { ...attributes, source: "nexus" } }, rule.reference)).toBe(false);
          state.persistent.mods.valheim[mod.id] = mod;
        }
      },
    };
    const context: any = { api, once: (fn: () => void) => once.push(fn),
      registerAttributeExtractor: (_priority: number, fn: any) => { extract = fn; },
      registerModSource: vi.fn(), registerDownloadProtocol: vi.fn(), registerAction: vi.fn(), registerInstaller: vi.fn(), registerModType: vi.fn(), registerMainPage: vi.fn() };
    registerVortexBridge(context, testCatalog(), client);
    once.forEach((fn) => fn());
    await installThunderstorePackage(api, client, testCatalog(), "Author", "Pack", "1.0.0", true, "valheim");
    expect(state.persistent.profiles.p.modState["unrelated-local-id"].enabled).toBe(true);
    expect(api.sendNotification).toHaveBeenCalledOnce();
  });

  it("keeps direct download identity and native dependency identity equivalent", () => {
    const lookup = toVortexLookup(record("Member"), valheimEntry, "valheim").value;
    const direct = { download: { modInfo: toDownloadInfo(lookup) } };
    const dependency = { download: { modInfo: { source: lookup.source, meta: lookup } } };
    expect(extractThunderstoreAttributes(direct)).toEqual(extractThunderstoreAttributes(dependency));
    expect(toDownloadInfo(lookup)).not.toHaveProperty("thunderstoreModpack");
  });

  it("runs startup migrations idempotently without rewriting Nexus records", () => {
    const lookup = toVortexLookup(record("Member"), valheimEntry, "valheim").value;
    const legacy = { type: "requires", reference: { id: "Author/Member", logicalFileName: "Author/Member", gameId: "valheim", repo: { repository: "thunderstore", modId: "Author/Member", fileId: "1.0.0", gameId: "valheim" } } };
    const mods: any = { root: { state: "installed", archiveId: "d", attributes: { source: "thunderstore" }, rules: [legacy] }, nexus: { attributes: { source: "nexus" }, rules: [legacy] } };
    const dispatch = vi.fn((a) => {
      if (a.attribute) mods[a.modId].attributes[a.attribute] = a.value;
      if (a.type === "removeModRule") mods[a.modId].rules = mods[a.modId].rules.filter((r: unknown) => r !== a.rule);
      if (a.type === "addModRule") mods[a.modId].rules.push(a.rule);
    });
    const api: any = { store: { dispatch }, getState: () => ({ persistent: { mods: { valheim: mods }, downloads: { files: { d: { game: ["valheim"], modInfo: { source: "thunderstore", meta: lookup } } } } } }) };
    migrateThunderstoreState(api);
    expect(mods.root.attributes.fileId).toBe("1.0.0");
    expect(mods.root.rules[0].reference).not.toHaveProperty("id");
    dispatch.mockClear(); migrateThunderstoreState(api);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mods.nexus.rules[0]).toBe(legacy);
  });
});
