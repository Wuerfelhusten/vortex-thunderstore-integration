import { beforeEach, describe, expect, it, vi } from "vitest";
import type { types } from "@nexusmods/vortex-api";
import { GameCatalog } from "../src/catalog";
import { ThunderstoreApiClient } from "../src/api";
import { registerUpdateEvents } from "../src/vortex/update-events";
import { registerVortexBridge } from "../src/vortex/register";
import { installThunderstorePackage } from "../src/vortex/install-package";
import { selectors, util } from "./helpers/vortex-api";

vi.mock("../src/vortex/install-package", () => ({ installThunderstorePackage: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  util.opn.mockResolvedValue(undefined);
  util.installIconSet.mockResolvedValue(undefined);
  vi.mocked(installThunderstorePackage).mockResolvedValue(undefined);
});

const entry = {
  mappingKey: "valheim", community: "valheim", name: "Valheim", vortexGameIds: ["valheim"],
  nexusDomain: "valheim", nexusGameId: 3667,
  status: "verified" as const, capabilities: ["browse", "install", "download", "updates"] as const,
  mappingVersion: "1", evidence: [], reviewedAt: "test", reviewer: "test",
};
const catalog = new GameCatalog({ schemaVersion: 1, snapshotId: "test", generatedAt: "test", entries: [entry] });
function setup() {
  const callbacks = new Map<string, (...args: unknown[]) => unknown>();
  const once: Array<() => void> = [];
  const mods: Record<string, { attributes: Record<string, unknown>; pinned?: boolean }> = {
    older: { attributes: { source: "thunderstore", modId: "Author/Older", fileId: "1.0.0", newestVersion: "2.0.0" } },
    current: { attributes: { source: "thunderstore", modId: "Author/Current", fileId: "2.0.0" } },
    nexus: { attributes: { source: "nexus", modId: 123, fileId: 456 } },
    pinned: { attributes: { source: "thunderstore", modId: "Author/Pinned", fileId: "1.0.0" }, pinned: true },
  };
  const getCommunityPackages = vi.fn().mockResolvedValue(["Older", "Current", "Pinned"].map((name) => ({ owner: "Author", name, versions: [{ version_number: "2.0.0" }] })));
  const api = {
    getState: () => ({ persistent: { mods: { valheim: mods } } }),
    store: { dispatch: vi.fn() }, sendNotification: vi.fn(), registerRepositoryLookup: vi.fn(),
    onAsync: vi.fn((name: string, callback: (...args: unknown[]) => unknown) => callbacks.set(name, callback)),
    events: { on: vi.fn((name: string, callback: (...args: unknown[]) => unknown) => callbacks.set(name, callback)), emit: vi.fn() },
  };
  const context = {
    api, once: (callback: () => void) => once.push(callback), registerModSource: vi.fn(),
    registerAttributeExtractor: vi.fn(), registerDownloadProtocol: vi.fn(), registerAction: vi.fn(),
    registerInstaller: vi.fn(), registerModType: vi.fn(), registerMainPage: vi.fn(),
  };
  const client = { getCommunityPackages } as unknown as ThunderstoreApiClient;
  const register = () => { registerUpdateEvents(context as unknown as types.IExtensionContext, catalog, client); once.forEach((callback) => callback()); };
  return { context, api, client, callbacks, once, getCommunityPackages, register };
}

describe("Vortex registration and update events", () => {
  it("does not recursively reintroduce transitive pins for resolved modpack members", async () => {
    const s = setup();
    Object.assign(s.client, {
      getPackageVersion: async () => ({ download_url: "https://gcdn.thunderstore.io/test.zip", file_size: 10 }),
      getFullDependencies: async () => ["Author-Loader-1.0.0"],
      resolveDownloadUrl: (url: string) => new URL(url),
    });
    registerVortexBridge(s.context as unknown as types.IExtensionContext, catalog, s.client);
    s.once.forEach((callback) => callback());
    const lookup = s.api.registerRepositoryLookup.mock.calls[0][2];
    const id = { repository: "thunderstore", gameId: "valheim", modId: "Author/Mod", fileId: "1.0.0" };
    expect((await lookup({ ...id, thunderstoreModpackMember: true }))[0].value.rules).toEqual([]);
    expect((await lookup(id))[0].value.rules).toHaveLength(1);
  });
  it("rechecks visibility when switching between supported, unsupported and absent profiles", () => {
    const s = setup();
    const active = vi.spyOn(selectors, "activeGameId");
    registerVortexBridge(s.context as unknown as types.IExtensionContext, catalog, s.client);
    const visible = s.context.registerMainPage.mock.calls[0][3].visible;
    const sourceCondition = s.context.registerModSource.mock.calls[0][3].condition;
    for (const [game, expected] of [["valheim", true], ["unknown", false], [undefined, false], ["valheim", true]] as const) {
      active.mockReturnValue(game);
      expect(visible()).toBe(expected);
      expect(sourceCondition()).toBe(expected);
    }
  });
  it.each(["unverified", "no-browse", "ambiguous"])("hides the browse page for %s mappings", (scenario) => {
    const s = setup();
    const entries = scenario === "ambiguous" ? [entry, { ...entry, mappingKey: "other", community: "other" }]
      : scenario === "unverified" ? [{ ...entry, status: "unsupported-layout" as const }]
        : [{ ...entry, capabilities: ["download"] as const }];
    const restricted = new GameCatalog({ schemaVersion: 1, snapshotId: "test", generatedAt: "test", entries });
    registerVortexBridge(s.context as unknown as types.IExtensionContext, restricted, s.client);
    expect(s.context.registerMainPage.mock.calls[0][3].visible()).toBe(false);
  });
  it("retains source, page, action, installer and deferred event registrations", () => {
    const s = setup();
    registerVortexBridge(s.context as unknown as types.IExtensionContext, catalog, s.client);
    expect(s.context.registerModSource.mock.calls[0].slice(0, 2)).toEqual(["thunderstore", "Thunderstore"]);
    expect(s.context.registerMainPage.mock.calls[0].slice(0, 2)).toEqual(["thunderstore", "Browse Thunderstore"]);
    expect(s.context.registerInstaller.mock.calls[0].slice(0, 2)).toEqual(["thunderstore-qualified-layout", 20]);
    expect(s.context.registerAction.mock.calls[0][0]).toBe("mods-action-icons");
    expect(s.api.registerRepositoryLookup).not.toHaveBeenCalled();
    expect(s.callbacks.size).toBe(0);
    s.once.forEach((callback) => callback());
    expect(s.api.registerRepositoryLookup).toHaveBeenCalledOnce();
    expect([...s.callbacks.keys()]).toEqual(["check-mods-version", "mod-update", "mods-update", "open-mod-page"]);
  });
  it("checks only requested Thunderstore instances and returns update IDs", async () => {
    const s = setup(); s.register();
    expect(await s.callbacks.get("check-mods-version")!("valheim", { older: {}, nexus: {} })).toEqual(["older"]);
    expect(s.api.store.dispatch.mock.calls.map(([value]) => value)).toEqual([
      { gameId: "valheim", modId: "older", attribute: "newestVersion", value: "2.0.0" },
      { gameId: "valheim", modId: "older", attribute: "newestFileId", value: "2.0.0" },
    ]);
  });
  it("uses cache unless forced and skips pinned packages", async () => {
    const s = setup(); s.register();
    const check = s.callbacks.get("check-mods-version")!;
    await check("valheim"); await check("valheim");
    expect(s.getCommunityPackages).toHaveBeenCalledTimes(1);
    await check("valheim", undefined, true);
    expect(s.getCommunityPackages).toHaveBeenCalledTimes(2);
    expect(s.api.store.dispatch.mock.calls.some(([value]) => value.modId === "pinned" || value.modId === "nexus")).toBe(false);
    expect(s.api.store.dispatch).toHaveBeenCalledWith({ gameId: "valheim", modId: "current", attribute: "newestFileId", value: "2.0.0" });
  });
  it("leaves an empty selection and unknown game untouched", async () => {
    const s = setup(); s.register();
    expect(await s.callbacks.get("check-mods-version")!("valheim", {})).toEqual([]);
    expect(await s.callbacks.get("check-mods-version")!("unknown")).toEqual([]);
    expect(s.getCommunityPackages).not.toHaveBeenCalled();
  });
  it("routes single updates to the target game only for the Thunderstore source", () => {
    const s = setup(); s.register(); const update = s.callbacks.get("mod-update")!;
    update("valheim", "Author/Older", "2.0.0", "nexus");
    update("valheim", "Author/Older", "2.0.0");
    expect(installThunderstorePackage).not.toHaveBeenCalled();
    update("valheim", "Author/Older", "2.0.0", "thunderstore");
    expect(installThunderstorePackage).toHaveBeenCalledWith(s.api, s.client, catalog, "Author", "Older", "2.0.0", false, "valheim");
  });
  it("bulk updates ignore Nexus instances and page actions use Thunderstore URLs", async () => {
    const s = setup(); s.register();
    await s.callbacks.get("mods-update")!("valheim", ["older", "nexus"]);
    expect(installThunderstorePackage).toHaveBeenCalledOnce();
    s.callbacks.get("open-mod-page")!("valheim", "Author/Older", "nexus");
    expect(util.opn).not.toHaveBeenCalled();
    s.callbacks.get("open-mod-page")!("valheim", "Author/Older", "thunderstore");
    expect(util.opn).toHaveBeenCalledWith("https://thunderstore.io/c/valheim/p/Author/Older/");
  });
  it("reports API failures without writing update attributes", async () => {
    const s = setup(); s.register(); s.getCommunityPackages.mockRejectedValue(new Error("offline"));
    expect(await s.callbacks.get("check-mods-version")!("valheim")).toEqual([]);
    expect(s.api.store.dispatch).not.toHaveBeenCalled();
    expect(s.api.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });
});
