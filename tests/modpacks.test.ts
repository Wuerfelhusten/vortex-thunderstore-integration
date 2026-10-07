import { describe, expect, it, vi } from "vitest";
import { planModpack } from "../src/modpacks";
import { record, testCatalog } from "./helpers/fixtures";
import { modpackInstructions, registerModpackInstaller } from "../src/vortex/modpack-installer";
import { chooseModpackProfile, prepareModpackProfile } from "../src/vortex/modpack-profile";
import { EventEmitter } from "node:events";

const catalog = testCatalog();

describe("modpack resolution", () => {
  it("reserves all direct pins before traversing older transitive requirements", async () => {
    const root = record("Pack", "1.0.0", ["Author-Mod-1.0.0", "Author-Loader-2.0.0"]);
    const getVersion = vi.fn(async (d) => d.packageName === "Mod"
      ? record("Mod", "1.0.0", ["Author-Loader-1.0.0"]) : record("Loader", "2.0.0"));
    const plan = await planModpack(root, { getVersion });
    expect(plan.records.map((r) => r.identity.package.name)).toEqual(["Loader", "Mod", "Pack"]);
    expect(plan.overrides).toEqual(["Author/Loader: 1.0.0 → 2.0.0"]);
    expect(getVersion).toHaveBeenCalledTimes(2);
  });
  it("does not upgrade a direct pin to a newer transitive requirement", async () => {
    const plan = await planModpack(record("Pack", "1.0.0", ["Author-Mod-1.0.0", "Author-Loader-1.0.0"]), {
      getVersion: async (d) => d.packageName === "Mod" ? record("Mod", "1.0.0", ["Author-Loader-2.0.0"]) : record("Loader"),
    });
    expect(plan.records[0].identity.version).toBe("1.0.0");
  });
  it("rejects contradictory direct pins", async () => {
    await expect(planModpack(record("Pack", "1.0.0", ["Author-Mod-1.0.0", "Author-Mod-2.0.0"]), { getVersion: vi.fn() })).rejects.toThrow("direkte Versionen");
  });
  it.each([undefined, { ...record("Mod"), isActive: false }, record("Wrong"), record("Mod", "2.0.0")])("rejects missing or invalid resolutions", async (value) => {
    await expect(planModpack(record("Pack", "1.0.0", ["Author-Mod-1.0.0"]), { getVersion: async () => value })).rejects.toThrow("fehlt oder ist ungültig");
  });
  it("rejects cycles", async () => {
    await expect(planModpack(record("Pack", "1.0.0", ["Author-Mod-1.0.0"]), { getVersion: async () => record("Mod", "1.0.0", ["Author-Pack-1.0.0"]) })).rejects.toThrow("Zyklische");
  });
  it("rejects incomplete dependency data", async () => {
    await expect(planModpack({ ...record("Pack"), dependenciesComplete: false }, { getVersion: vi.fn() })).rejects.toThrow("Unvollständiges");
  });
});

describe("modpack installer", () => {
  it("accepts a metadata-only archive without deploying documentation to the game", () => {
    expect(modpackInstructions(["manifest.json", "README.md", "icon.png", "LICENSE"], "valheim", catalog))
      .toEqual([{ type: "attribute", key: "thunderstoreModpack", value: true }, { type: "setmodtype", value: "thunderstore-modpack" }]);
  });
  it("rejects traversal and unverified games", () => {
    expect(() => modpackInstructions(["manifest.json", "../bad.dll"], "valheim", catalog)).toThrow();
    expect(() => modpackInstructions(["manifest.json"], "other", catalog)).toThrow();
  });
  it("never claims an unrelated Nexus download with a manifest", async () => {
    const registerInstaller = vi.fn();
    const download = { game: ["valheim"], localPath: "pack.zip", modInfo: { source: "nexus", thunderstoreModpack: true } };
    registerModpackInstaller({ api: { getState: () => ({ persistent: { downloads: { files: { d: download } } } }) }, registerInstaller, registerModType: vi.fn() } as any, catalog);
    const test = registerInstaller.mock.calls[0][2];
    expect((await test(["manifest.json"], "valheim", "C:/downloads/valheim/pack.zip")).supported).toBe(false);
    download.modInfo.source = "thunderstore";
    expect((await test(["manifest.json"], "valheim", "C:/downloads/valheim/pack.zip")).supported).toBe(true);
    expect((await test(["manifest.json"], "valheim", "C:/downloads/valheim/other.zip")).supported).toBe(false);
  });
});

describe("modpack profile selection", () => {
  function setup() {
    const events = new EventEmitter();
    const state: any = { persistent: { profiles: { p: { id: "p", name: "Existing", gameId: "valheim", modState: {} } } }, settings: { profiles: { activeProfileId: "p" } } };
    const dispatch = vi.fn((a) => {
      if (a.type === "setProfile") state.persistent.profiles[a.profile.id] = a.profile;
      if (a.type === "setNextProfile") { state.settings.profiles.activeProfileId = a.id; events.emit("profile-did-change", a.id); }
    });
    const showDialog = vi.fn();
    const api: any = { getState: () => state, store: { dispatch }, events, showDialog };
    return { api, state, dispatch, showDialog };
  }
  it("cancels without creating or changing profiles", async () => {
    const s = setup(); s.showDialog.mockResolvedValue({ action: "Abbrechen" });
    expect(await chooseModpackProfile(s.api, "valheim", "Pack")).toBeUndefined();
    expect(s.dispatch).not.toHaveBeenCalled();
  });
  it("uses the chosen existing profile", async () => {
    const s = setup(); s.showDialog.mockResolvedValue({ action: "Weiter", input: { p: true } });
    const choice = await chooseModpackProfile(s.api, "valheim", "Pack");
    expect((await prepareModpackProfile(s.api, choice!))?.id).toBe("p");
    expect(s.dispatch).not.toHaveBeenCalled();
  });
  it("creates an empty profile and waits for the requested switch", async () => {
    const s = setup(); s.showDialog.mockResolvedValue({ action: "Ja" });
    const profile = await prepareModpackProfile(s.api, { gameId: "valheim", name: "Pack" });
    expect(profile?.modState).toEqual({});
    expect(profile?.name).toBe("Pack");
    expect(s.state.settings.profiles.activeProfileId).toBe(profile?.id);
    expect(s.api.events.listenerCount("profile-did-change")).toBe(0);
  });
  it("can target an inactive profile without switching", async () => {
    const s = setup(); s.showDialog.mockResolvedValue({ action: "Nein" });
    const profile = await prepareModpackProfile(s.api, { gameId: "valheim", name: "Pack" });
    expect(profile?.id).not.toBe("p");
    expect(s.state.settings.profiles.activeProfileId).toBe("p");
  });
  it("rejects profiles belonging to another game", async () => {
    const s = setup(); s.state.persistent.profiles.p.gameId = "other";
    await expect(prepareModpackProfile(s.api, { gameId: "valheim", profileId: "p", name: "Pack" })).rejects.toThrow("nicht mehr verfügbar");
  });
  it.each(["Abbrechen", "", "Close"])("cancels on %s without creating a profile", async (action) => {
    const s = setup(); s.showDialog.mockResolvedValue({ action });
    expect(await prepareModpackProfile(s.api, { gameId: "valheim", name: "Pack" })).toBeUndefined();
    expect(s.dispatch).not.toHaveBeenCalled();
  });
  it("removes the listener after a profile-switch timeout", async () => {
    vi.useFakeTimers();
    try {
      const s = setup(); s.showDialog.mockResolvedValue({ action: "Ja" });
      s.state.persistent.profiles.other = { id: "other", name: "Other", gameId: "valheim", modState: {} };
      s.dispatch.mockImplementation(() => undefined);
      const result = prepareModpackProfile(s.api, { gameId: "valheim", name: "Pack", profileId: "other" });
      const rejection = expect(result).rejects.toThrow("Profilwechsel nicht abgeschlossen");
      await vi.advanceTimersByTimeAsync(45000);
      await rejection;
      expect(s.api.events.listenerCount("profile-did-change")).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("rejects an unexpected profile switch and removes its listener", async () => {
    const s = setup(); s.showDialog.mockResolvedValue({ action: "Ja" });
    s.state.persistent.profiles.other = { id: "other", name: "Other", gameId: "valheim", modState: {} };
    s.dispatch.mockImplementation(() => { s.api.events.emit("profile-did-change", "wrong"); });
    await expect(prepareModpackProfile(s.api, { gameId: "valheim", name: "Pack", profileId: "other" })).rejects.toThrow("anderes Profil");
    expect(s.api.events.listenerCount("profile-did-change")).toBe(0);
  });
});
