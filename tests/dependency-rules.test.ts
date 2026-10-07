import { describe, expect, it, vi } from "vitest";
import { repairThunderstoreRules } from "../src/vortex/repair-rules";
import { toVortexLookup } from "../src/metadata";
import { packageIdentity, versionIdentity } from "../src/identity";
import { parseDependency } from "../src/dependencies";

const reference = { id: "JereKuusela/Expand_World_Data", logicalFileName: "JereKuusela/Expand_World_Data", gameId: "valheim", versionMatch: "1.14.0",
  repo: { repository: "thunderstore", modId: "JereKuusela/Expand_World_Data", fileId: "1.14.0", gameId: "valheim", thunderstoreModpackMember: true } };
const rule = { type: "requires", reference, extra: { version: "1.14.0" } };
function repair(source = "thunderstore", candidate = rule) {
  const dispatch = vi.fn();
  const mod = { attributes: { source }, rules: [candidate] };
  const api: any = { store: { dispatch }, getState: () => ({ persistent: { mods: { valheim: { root: mod } } } }) };
  repairThunderstoreRules(api);
  return dispatch.mock.calls.map(([a]) => a);
}
describe("portable Thunderstore dependency references", () => {
  it("does not constrain dependencies to a nonexistent local install ID", () => {
    const identity = versionIdentity(packageIdentity("Author", "Pack"), "1.0.0");
    const lookup = toVortexLookup({ identity, listing: { version: identity, community: "valheim" }, downloadUrl: "https://gcdn.thunderstore.io/test.zip", fileName: "test.zip", fileSize: 1,
      dependencies: [parseDependency("JereKuusela-Expand_World_Data-1.14.0", "valheim")], dependenciesComplete: true, isActive: true }, { mappingVersion: "1" } as any, "valheim");
    const ref: any = lookup.value.rules![0].reference;
    expect(ref).not.toHaveProperty("id");
    expect(ref.repo).toMatchObject({ repository: "thunderstore", modId: reference.repo.modId, fileId: "1.14.0" });
  });
  it("replaces the legacy rule while preserving version and modpack constraints", () => {
    const changes = repair();
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ type: "removeModRule", rule });
    const updated = changes[1].rule;
    expect(updated.reference).not.toHaveProperty("id");
    expect(updated.reference.repo).toEqual(reference.repo);
    expect(updated.reference.versionMatch).toBe("1.14.0");
    expect(updated.extra).toEqual(rule.extra);
    expect(repair("thunderstore", updated)).toEqual([]);
  });
  it("leaves Nexus owners, local-ID rules and foreign games unchanged", () => {
    expect(repair("nexus")).toEqual([]);
    expect(repair("thunderstore", { ...rule, reference: { ...reference, id: "actual-local-id" } })).toEqual([]);
    expect(repair("thunderstore", { ...rule, reference: { ...reference, gameId: "other" } })).toEqual([]);
  });
});
