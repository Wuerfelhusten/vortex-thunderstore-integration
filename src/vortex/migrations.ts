import type { types } from "@nexusmods/vortex-api";
import { repairThunderstoreMetadata } from "./repair-metadata";
import { repairThunderstoreRules } from "./repair-rules";

/** Idempotent upgrades, kept for users coming from older releases.
 * Order matters: rule repair needs the source identity repaired first.
 * No global completion flag: old downloads can be imported later. */
export function migrateThunderstoreState(api: types.IExtensionApi): void {
  repairThunderstoreMetadata(api);
  repairThunderstoreRules(api);
}
