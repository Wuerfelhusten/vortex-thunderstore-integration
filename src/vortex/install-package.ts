import { types } from "@nexusmods/vortex-api";
import { ThunderstoreApiClient } from "../api";
import { GameCatalog } from "../catalog";
import { toVortexLookup } from "../metadata";
import { activeGameId } from "./game-context";
import { loadVersionRecord } from "./package-records";
import { downloadAndInstall } from "./downloads";
import { installModpack } from "./install-modpack";

const modpackInstalls = new WeakSet<types.IExtensionApi>();

export async function installThunderstorePackage(
  api: types.IExtensionApi, client: ThunderstoreApiClient, catalog: GameCatalog,
  namespace: string, name: string, version: string, isModpack = false, targetGameId?: string,
): Promise<void> {
  if (modpackInstalls.has(api)) throw new Error("Bitte die laufende Modpack-Installation zuerst abschließen");
  if (isModpack) modpackInstalls.add(api);
  try {
    const gameId = targetGameId ?? activeGameId(api);
    if (gameId === undefined) throw new Error("Kein aktives Vortex-Spielprofil");
    const resolution = catalog.resolve(gameId);
    if (resolution.kind !== "resolved" || resolution.entry.status !== "verified" || !resolution.entry.capabilities.includes("install")) {
      throw new Error("Für dieses Spiel ist keine geprüfte Thunderstore-Installation freigegeben");
    }
    const entry = resolution.entry;
    if (isModpack) {
      if (!await installModpack(api, client, entry, gameId, namespace, name, version)) return;
    } else {
      const record = await loadVersionRecord(client, namespace, name, version, entry.community);
      if (!record) throw new Error("Thunderstore-Paket konnte nicht verifiziert werden");
      await downloadAndInstall(api, toVortexLookup(record, entry, gameId).value);
    }
    api.sendNotification?.({
      id: `thunderstore-installed-${namespace}-${name}-${version}`, type: "success",
      message: `${namespace}/${name} ${version} wurde in Vortex installiert.`, displayMS: 5000,
    });
  } finally {
    if (isModpack) modpackInstalls.delete(api);
  }
}
