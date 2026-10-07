import { actions, selectors, types } from "@nexusmods/vortex-api";
import { ThunderstoreApiClient } from "../api";
import { CatalogEntry, ThunderstoreVersionRecord } from "../types";
import { toVortexLookup } from "../metadata";
import { planModpack } from "../modpacks";
import { installedThunderstoreMods } from "../updates";
import { activeGameId } from "./game-context";
import { loadVersionRecord } from "./package-records";
import { downloadAndInstall } from "./downloads";
import { chooseModpackProfile, prepareModpackProfile, assertProfile } from "./modpack-profile";
import { MODPACK_INSTALLER } from "./modpack-installer";
import { asHostRule } from "./contracts";

function installedMemberIds(api: types.IExtensionApi, gameId: string, required: ThunderstoreVersionRecord[]): string[] {
  const state = api.getState();
  const installed = installedThunderstoreMods(state, gameId).filter((mod) => state.persistent.mods[gameId]?.[mod.modId]?.state === "installed");
  const ids: string[] = [];
  const missing: string[] = [];
  for (const record of required) {
    const { namespace, name } = record.identity.package;
    const match = installed.find((mod) => mod.identity.namespace.toLowerCase() === namespace.toLowerCase()
      && mod.identity.name.toLowerCase() === name.toLowerCase() && mod.installedVersion === record.identity.version);
    if (match) ids.push(match.modId);
    else missing.push(`${namespace}/${name} ${record.identity.version}`);
  }
  if (missing.length) throw new Error(`Modpack unvollständig: ${missing.join(", ")}. Bereits installierte Mods bleiben erhalten; Installation kann erneut gestartet werden.`);
  return ids;
}

/** Returns false for a user cancellation; only completed installs report success. */
export async function installModpack(
  api: types.IExtensionApi, client: ThunderstoreApiClient, entry: CatalogEntry,
  gameId: string, namespace: string, name: string, version: string,
): Promise<boolean> {
  const choice = await chooseModpackProfile(api, gameId, name);
  if (!choice) return false;
  const record = await loadVersionRecord(client, namespace, name, version, entry.community);
  if (!record) throw new Error("Thunderstore-Paket konnte nicht verifiziert werden");
  const plan = await planModpack(record, {
    getVersion: (dependency, community) => loadVersionRecord(client, dependency.namespace, dependency.packageName, dependency.version, community),
  });
  const members = plan.records.slice(0, -1);
  const lookup = toVortexLookup({ ...record, dependencies: members.map((member) => ({
    raw: `${member.identity.package.namespace}-${member.identity.package.name}-${member.identity.version}`,
    namespace: member.identity.package.namespace, packageName: member.identity.package.name,
    version: member.identity.version, community: member.listing.community,
  })) }, entry, gameId).value;
  const rules = lookup.rules ?? [];
  for (const rule of rules) {
    rule.reference.versionMatch = rule.extra.version;
    rule.reference.repo.thunderstoreModpackMember = true;
  }
  const profile = await prepareModpackProfile(api, choice);
  if (!profile) return false;
  const initialActiveProfile = selectors.activeProfile(api.getState())?.id;
  const guard = () => {
    assertProfile(api, gameId, profile.id);
    if (activeGameId(api) !== gameId) throw new Error("Aktives Spiel wurde geändert; Modpack-Installation angehalten.");
    if (selectors.activeProfile(api.getState())?.id !== initialActiveProfile) throw new Error("Aktives Profil wurde geändert; Modpack-Installation angehalten. Bereits installierte Dateien bleiben erhalten.");
  };
  const modId = await downloadAndInstall(api, lookup, {
    isModpack: true, guard,
    install: { allowAutoEnable: false, profileId: profile.id, forceInstaller: MODPACK_INSTALLER },
  });
  guard();
  if (!modId) throw new Error("Vortex hat keine Modpack-ID zurückgegeben");
  const store = api.store;
  if (!store) throw new Error("Vortex-Profilverwaltung ist nicht verfügbar");
  for (const rule of rules) store.dispatch(actions.addModRule(gameId, modId, asHostRule(rule)));
  await api.emitAndAwait("install-from-dependencies", modId, rules, false, profile.id);
  guard();
  for (const id of [...installedMemberIds(api, gameId, members), modId]) store.dispatch(actions.setModEnabled(profile.id, id, true));
  // Dependencies are already managed by the host installation pipeline.
  // Only announce the root, and only for the currently active profile.
  if (selectors.activeProfile(api.getState())?.id === profile.id) api.events.emit("mods-enabled", [modId], true, gameId);
  return true;
}
