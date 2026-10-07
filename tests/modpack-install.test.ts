import { beforeEach, describe, expect, it, vi } from "vitest";
import { installThunderstorePackage } from "../src/vortex/install-package";
import { loadVersionRecord } from "../src/vortex/package-records";
import { downloadAndInstall } from "../src/vortex/downloads";
import { record, testCatalog } from "./helpers/fixtures";

vi.mock("../src/vortex/package-records", () => ({ loadVersionRecord: vi.fn() }));
vi.mock("../src/vortex/downloads", () => ({ downloadAndInstall: vi.fn() }));
vi.mock("../src/download-mirror", () => ({ pickThunderstoreMirror: async (url: string) => url }));

const catalog = testCatalog();

beforeEach(() => { vi.resetAllMocks(); });
function setup() {
  const state: any = { persistent: { profiles: { p: { id: "p", gameId: "valheim", name: "Existing", modState: {} } }, mods: { valheim: {} } }, settings: { profiles: { activeProfileId: "p" } } };
  const dispatch = vi.fn();
  const api: any = { getState: () => state, store: { dispatch }, showDialog: vi.fn().mockResolvedValue({ action: "Weiter", input: { p: true } }),
    events: { emit: vi.fn() }, sendNotification: vi.fn(), emitAndAwait: vi.fn().mockImplementation(async () => {
      state.persistent.mods.valheim.dep = { state: "installed", attributes: { source: "thunderstore", modId: "Author/Dependency", fileId: "1.0.0" } };
    }) };
  vi.mocked(loadVersionRecord).mockImplementation(async (_client, namespace, name, version) => {
    return record(name, version, name === "Pack" ? ["Author-Dependency-1.0.0"] : [], namespace);
  });
  vi.mocked(downloadAndInstall).mockResolvedValue("root");
  const run = () => installThunderstorePackage(api, {} as any, catalog, "Author", "Pack", "1.0.0", true, "valheim");
  return { api, state, dispatch, run };
}
describe("modpack installation orchestration", () => {
  it("passes exact flat member rules and the selected profile to Vortex", async () => {
    const s = setup(); await s.run();
    expect(downloadAndInstall).toHaveBeenCalledWith(s.api, expect.anything(), { isModpack: true, guard: expect.any(Function), install: { allowAutoEnable: false, profileId: "p", forceInstaller: "thunderstore-modpack" } });
    const rules = s.api.emitAndAwait.mock.calls[0][2];
    expect(rules[0].reference).toMatchObject({ versionMatch: "1.0.0", repo: { fileId: "1.0.0", thunderstoreModpackMember: true } });
    expect(s.api.emitAndAwait).toHaveBeenCalledWith("install-from-dependencies", "root", rules, false, "p");
    expect(s.dispatch).toHaveBeenCalledWith({ type: "setModEnabled", profileId: "p", modId: "dep", value: true });
    expect(s.api.sendNotification).toHaveBeenCalledOnce();
  });
  it("cancels before API requests or downloads", async () => {
    const s = setup(); s.api.showDialog.mockResolvedValue({ action: "Abbrechen" }); await s.run();
    expect(loadVersionRecord).not.toHaveBeenCalled(); expect(downloadAndInstall).not.toHaveBeenCalled();
  });
  it("cancels in the second dialog without downloading or creating a profile", async () => {
    const s = setup();
    s.api.showDialog.mockResolvedValueOnce({ action: "Weiter", input: { __new: true } }).mockResolvedValueOnce({ action: "Abbrechen" });
    await s.run();
    expect(downloadAndInstall).not.toHaveBeenCalled();
    expect(s.dispatch).not.toHaveBeenCalled();
    expect(s.api.sendNotification).not.toHaveBeenCalled();
  });
  it("does not report success for skipped dependencies", async () => {
    const s = setup(); s.api.emitAndAwait.mockResolvedValue(undefined);
    await expect(s.run()).rejects.toThrow("Modpack unvollständig");
    expect(s.api.sendNotification).not.toHaveBeenCalled();
  });
  it("does not count incomplete installations as installed", async () => {
    const s = setup(); s.api.emitAndAwait.mockImplementation(async () => {
      s.state.persistent.mods.valheim.dep = { state: "installing", attributes: { source: "thunderstore", modId: "Author/Dependency", fileId: "1.0.0" } };
    });
    await expect(s.run()).rejects.toThrow("Modpack unvollständig");
  });
  it("stops if the user changes profile during download and releases the install lock", async () => {
    const s = setup(); vi.mocked(downloadAndInstall).mockImplementationOnce(async () => { s.state.settings.profiles.activeProfileId = "other"; return "root"; });
    await expect(s.run()).rejects.toThrow("Aktives Profil wurde geändert");
    expect(s.api.emitAndAwait).not.toHaveBeenCalled();
    s.state.settings.profiles.activeProfileId = "p";
    await s.run();
    expect(s.api.sendNotification).toHaveBeenCalledOnce();
  });
});
