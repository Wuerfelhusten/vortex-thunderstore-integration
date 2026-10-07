import path from "node:path";
import { selectors, types } from "@nexusmods/vortex-api";
import { GameCatalog } from "../catalog";
import { buildInstallInstructions } from "../installer";
import { validateArchiveEntries } from "../security";
import { activeGameRoot } from "./game-context";

export const MODPACK_INSTALLER = "thunderstore-modpack";
const metadataNames = new Set(["manifest.json", "readme.md", "changelog.md", "icon.png", "license", "license.txt", "license.md"]);

export function modpackInstructions(files: string[], gameId: string, catalog: GameCatalog): types.IInstruction[] {
  const resolution = catalog.resolve(gameId);
  if (resolution.kind !== "resolved" || resolution.entry.status !== "verified" || !resolution.entry.capabilities.includes("install")) {
    throw new Error("Kein freigegebenes Modpack-Installationslayout für dieses Spiel");
  }
  const checked = validateArchiveEntries(files.filter((file) => !/[\\/]$/u.test(file)).map((file) => ({
    path: file, kind: "file" as const, compressedSize: 1, uncompressedSize: 1,
  }))).entries;
  if (!checked.some((file) => path.posix.basename(file.normalizedPath).toLowerCase() === "manifest.json")) {
    throw new Error("Thunderstore-Modpack enthält kein manifest.json");
  }
  const hasPayload = checked.some((file) => !metadataNames.has(path.posix.basename(file.normalizedPath).toLowerCase()));
  const instructions: types.IInstruction[] = hasPayload
    ? buildInstallInstructions(checked.map((file) => file.path).filter((file) => !/^license(?:\.(?:txt|md))?$/iu.test(path.basename(file))), gameId, resolution.entry)
    : [];
  return [...instructions, { type: "attribute", key: "thunderstoreModpack", value: true }, { type: "setmodtype", value: MODPACK_INSTALLER }];
}

export function registerModpackInstaller(context: types.IExtensionContext, catalog: GameCatalog): void {
  const api = context.api;
  // Match only a download explicitly created as a Thunderstore modpack.
  // A manifest in an unrelated/Nexus archive must never claim this installer.
  const isModpackDownload = (archivePath: string | undefined, gameId: string): boolean => {
    if (!archivePath) return false;
    const state = api.getState();
    return Object.values(state.persistent.downloads?.files ?? {}).some((download) => {
      const info = download.modInfo;
      if (info?.source !== "thunderstore" || info?.thunderstoreModpack !== true || !download.localPath) return false;
      const games = Array.isArray(download.game) ? download.game : [download.game];
      return games.includes(gameId) && path.resolve(selectors.downloadPathForGame(state, gameId), download.localPath).toLowerCase() === path.resolve(archivePath).toLowerCase();
    });
  };
  context.registerInstaller(MODPACK_INSTALLER, 19, async (files, gameId, archivePath) => {
    if (!isModpackDownload(archivePath, gameId)) return { supported: false, requiredFiles: [] };
    try { modpackInstructions(files, gameId, catalog); return { supported: true, requiredFiles: ["manifest.json"] }; }
    catch { return { supported: false, requiredFiles: [] }; }
  }, async (files, _destination, gameId, _progress, _choices, _unattended, archivePath) => {
    if (!isModpackDownload(archivePath, gameId)) throw new Error("Archiv ist kein bestätigter Thunderstore-Modpack-Download");
    return { instructions: modpackInstructions(files, gameId, catalog) };
  });
  context.registerModType(MODPACK_INSTALLER, 9, (gameId) => catalog.can(gameId, "install"),
    (game) => activeGameRoot(api, game.id),
    async (instructions) => instructions.some((i) => i.type === "attribute" && i.key === "thunderstoreModpack" && i.value === true),
    { name: "Thunderstore Modpack", customDependencyManagement: true });
}
