import { describe, expect, it, vi } from "vitest";
import { extractThunderstoreAttributes } from "../src/metadata";
import { repairThunderstoreMetadata } from "../src/vortex/repair-metadata";

const metadata = { source: "thunderstore", namespace: "JereKuusela", packageName: "Expand_World_Data", version: "1.14.0", vortexGameId: "valheim", community: "valheim" };
const lookup = { source: "thunderstore", meta: { thunderstore: metadata }, details: { modId: "JereKuusela/Expand_World_Data", fileId: "1.14.0" } };
const download = { game: ["valheim"], modInfo: { source: "thunderstore", name: "JereKuusela/Expand_World_Data", meta: lookup } };

describe("native dependency metadata", () => {
  it.each([
    lookup,
    { meta: lookup },
    { download: { modInfo: lookup } },
    { download },
    download.modInfo,
  ])("extracts identity from each supported host shape", (input) => {
    expect(extractThunderstoreAttributes(input)).toMatchObject({ source: "thunderstore", modId: "JereKuusela/Expand_World_Data", fileId: "1.14.0", name: "Expand_World_Data", logicalFileName: "JereKuusela/Expand_World_Data", version: "1.14.0" });
  });
  it.each([{}, null, { source: "nexus", meta: lookup.meta }, { download: { modInfo: { source: "nexus", meta: lookup } } }, { meta: { thunderstore: { ...metadata, namespace: undefined } } }])("does not guess missing identities or claim Nexus records", (input) => {
    expect(extractThunderstoreAttributes(input)).toEqual({});
  });
});

describe("repair installed Thunderstore metadata", () => {
  function run(attributes: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
    const dispatch = vi.fn();
    const state: any = { persistent: { mods: { valheim: { broken: { state: "installed", archiveId: "d", attributes, ...overrides } } }, downloads: { files: { d: download } } } };
    repairThunderstoreMetadata({ getState: () => state, store: { dispatch } } as any);
    return dispatch.mock.calls.map(([a]) => a);
  }
  it("fills identity and replaces only the generated temporary display name", () => {
    const result = run({ source: "thunderstore", customFileName: "JereKuusela/Expand_World_Data - __vortex_tmp_00000002" });
    expect(result).toContainEqual({ gameId: "valheim", modId: "broken", attribute: "fileId", value: "1.14.0" });
    expect(result).toContainEqual({ gameId: "valheim", modId: "broken", attribute: "customFileName", value: "Expand_World_Data" });
  });
  it("preserves user-assigned names", () => {
    expect(run({ source: "thunderstore", customFileName: "My world mod" }).some((a) => a.attribute === "customFileName")).toBe(false);
  });
  it.each([
    [{ source: "nexus" }, {}],
    [{ source: "thunderstore", modId: "Different/Mod" }, {}],
    [{ source: "thunderstore", fileId: "0.0.1" }, {}],
    [{ source: "thunderstore" }, { archiveId: "missing" }],
    [{ source: "thunderstore" }, { state: "installing" }],
  ])("skips unrelated, ambiguous or incomplete mods", (attributes, overrides) => {
    expect(run(attributes, overrides)).toEqual([]);
  });
});
