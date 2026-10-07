import { actions, types } from "@nexusmods/vortex-api";
import type { HostRule } from "./contracts";

/** Migrate only our old generated package-as-local-id references. */
export function repairThunderstoreRules(api: types.IExtensionApi): void {
  if (!api.store) return;
  for (const [gameId, mods] of Object.entries(api.getState().persistent.mods ?? {})) {
    for (const [modId, mod] of Object.entries(mods ?? {})) {
      if (mod.attributes?.source !== "thunderstore") continue;
      for (const rule of mod.rules ?? []) {
        const ref = (rule as HostRule).reference;
        if ((rule as HostRule).type !== "requires" || ref?.repo?.repository !== "thunderstore"
          || typeof ref.repo.modId !== "string" || !ref.repo.modId.includes("/")
          || ref.id !== ref.repo.modId || ref.logicalFileName !== ref.repo.modId
          || ref.gameId !== gameId || ref.repo.gameId !== gameId) continue;
        const reference = { ...ref };
        delete reference.id;
        api.store.dispatch(actions.removeModRule(gameId, modId, rule));
        api.store.dispatch(actions.addModRule(gameId, modId, { ...rule, reference }));
      }
    }
  }
}
