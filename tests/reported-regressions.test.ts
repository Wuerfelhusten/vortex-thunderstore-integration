import { describe, expect, it, vi } from "vitest";
import { buildValheimInstallInstructions } from "../src/valheim";
import { pickThunderstoreMirror } from "../src/download-mirror";

describe("Valheim root DLL assets", () => {
  it.each(["", "Package/"])("colocates plugins assets in a %s archive", (prefix) => {
    const files = ["manifest.json", "plugins/Other.dll", "World.dll", "assetBundleManifest_full", "plugins/Bundles/world", "config/world.cfg", "BepInEx/plugins/Explicit.dll"];
    const destinations = buildValheimInstallInstructions(files.map((file) => prefix + file)).map((item) => item.destination);
    expect(destinations).toEqual([
      "BepInEx/plugins/World/Other.dll", "BepInEx/plugins/World/World.dll",
      "BepInEx/plugins/World/assetBundleManifest_full", "BepInEx/plugins/World/Bundles/world",
      "BepInEx/config/world.cfg", "BepInEx/plugins/Explicit.dll",
    ]);
  });
  it("preserves packages without a root DLL", () => {
    expect(buildValheimInstallInstructions(["manifest.json", "plugins/World.dll", "plugins/Bundles/world"]).map((i) => i.destination))
      .toEqual(["BepInEx/plugins/World.dll", "BepInEx/plugins/Bundles/world"]);
  });
  it("rejects collisions introduced by colocation", () => {
    expect(() => buildValheimInstallInstructions(["manifest.json", "World.dll", "plugins/World.dll"]))
      .toThrow("collision");
  });
});

describe("Thunderstore CDN fallback", () => {
  const original = "https://thunderstore.io/package/download/a/b/1.0.0/";
  it("uses gcdn only after a ccdn GET 404 and a successful mirror probe", async () => {
    const probe = vi.fn().mockResolvedValueOnce({ status: 302, location: "https://ccdn.thunderstore.io/live/a.zip" })
      .mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ status: 206 });
    expect(await pickThunderstoreMirror(original, probe)).toBe("https://gcdn.thunderstore.io/live/a.zip");
    expect(probe).toHaveBeenNthCalledWith(3, "https://gcdn.thunderstore.io/live/a.zip");
  });
  it.each([200, 206, 403, 429, 500, 0])("does not switch for status %s", async (status) => {
    const probe = vi.fn().mockResolvedValue({ status });
    expect(await pickThunderstoreMirror(original, probe)).toBe(original);
    expect(probe).toHaveBeenCalledTimes(1);
  });
  it("keeps the original when the mirror is missing", async () => {
    const probe = vi.fn().mockResolvedValueOnce({ status: 302, location: "https://ccdn.thunderstore.io/a.zip" })
      .mockResolvedValue({ status: 404 });
    expect(await pickThunderstoreMirror(original, probe)).toBe(original);
  });
  it.each(["https://evil.test/a", "http://ccdn.thunderstore.io/a", "https://user:password@ccdn.thunderstore.io/a"])("does not follow unsafe redirects: %s", async (location) => {
    const probe = vi.fn().mockResolvedValue({ status: 302, location });
    expect(await pickThunderstoreMirror(original, probe)).toBe(original);
    expect(probe).toHaveBeenCalledTimes(1);
  });
  it("bounds redirect loops", async () => {
    const probe = vi.fn().mockResolvedValue({ status: 302, location: original });
    expect(await pickThunderstoreMirror(original, probe)).toBe(original);
    expect(probe).toHaveBeenCalledTimes(6);
  });
  it("keeps the original on transport failure", async () => {
    expect(await pickThunderstoreMirror(original, async () => { throw new Error("timeout"); })).toBe(original);
  });
});
