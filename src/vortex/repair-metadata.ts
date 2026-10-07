import { actions, types } from "@nexusmods/vortex-api";
import { extractThunderstoreAttributes } from "../metadata";

/** Repair only proven Thunderstore records, via their exact archive association.
 * Never infer identity from display names or rewrite staging files. */
export function repairThunderstoreMetadata(api: types.IExtensionApi): void {
  if (!api.store) return;
  const state = api.getState();
  const downloads = state.persistent.downloads?.files ?? {};
  for (const [gameId, mods] of Object.entries(state.persistent.mods ?? {})) {
    for (const [modId, mod] of Object.entries(mods ?? {})) {
      if (mod.state !== "installed" || mod.attributes?.source !== "thunderstore" || !mod.archiveId) continue;
      const download = downloads[mod.archiveId];
      if (!download || download.modInfo?.source !== "thunderstore" || !download.game?.includes(gameId)) continue;
      const attributes = extractThunderstoreAttributes({ download });
      const metadata = attributes.thunderstore as { vortexGameId?: string } | undefined;
      if (!metadata || metadata.vortexGameId !== gameId) continue;
      // Existing explicit identities must agree before filling any fields.
      if (mod.attributes.modId != null && mod.attributes.modId !== attributes.modId) continue;
      if (mod.attributes.fileId != null && mod.attributes.fileId !== attributes.fileId) continue;
      for (const [key, value] of Object.entries(attributes)) {
        if (mod.attributes[key] == null) api.store.dispatch(actions.setModAttribute(gameId, modId, key, value));
      }
      for (const key of ["logicalFileName", "customFileName", "name", "modName"]) {
        const old = mod.attributes[key];
        const prefix = `${attributes.modId} - `;
        if (typeof old === "string" && old.startsWith(prefix) && /^_+vortex_tmp_\d+$/u.test(old.slice(prefix.length))) {
          api.store.dispatch(actions.setModAttribute(gameId, modId, key, key === "logicalFileName" ? attributes.modId : attributes.name));
        }
      }
    }
  }
}
