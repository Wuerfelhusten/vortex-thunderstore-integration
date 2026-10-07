import { types } from "@nexusmods/vortex-api";
import { GameCatalog } from "../catalog";
import { adapterSupportsFiles, buildInstallInstructions } from "../installer";
import { VALHEIM_ADAPTER_ID, VALHEIM_GAME_ID } from "../valheim";
import { activeGameRoot } from "./game-context";

function isValheimThunderstoreInstructions(instructions: Array<{ type?: string; destination?: string }>): boolean {
  const copyDestinations = instructions
    .filter((instruction) => instruction.type === "copy" && typeof instruction.destination === "string")
    .map((instruction) => instruction.destination as string)
    .map((destination) => destination.replaceAll("\\", "/").toLocaleLowerCase("en-US"));
  if (copyDestinations.some((destination) => destination.includes("bepinex/core/") || destination.endsWith("/winhttp.dll") || destination.endsWith("/doorstop_config.ini"))) return false;
  return copyDestinations.some((destination) =>
    destination.startsWith("bepinex/plugins/")
    || destination.startsWith("bepinex/config/")
    || destination.startsWith("bepinex/patchers/"),
  );
}

export function registerInstallers(context: types.IExtensionContext, catalog: GameCatalog): void {
  const api = context.api;
  context.registerInstaller(
    "thunderstore-qualified-layout",
    20,
    async (files, gameId) => {
      const resolution = catalog.resolve(gameId);
      if (resolution.kind !== "resolved") return { supported: false, requiredFiles: [] };
      return {
        supported: adapterSupportsFiles(files, gameId, resolution.entry),
        requiredFiles: resolution.entry.adapter?.id === VALHEIM_ADAPTER_ID
          ? ["manifest.json"]
          : resolution.entry.adapter?.archivePrefixes ?? [],
      };
    },
    async (files, destinationPath, gameId) => {
      const resolution = catalog.resolve(gameId);
      if (resolution.kind !== "resolved") throw new Error("No verified Thunderstore mapping for this game");
      const instructions = buildInstallInstructions(files, gameId, resolution.entry);
      // Vortex resolves instruction destinations relative to the supplied staging path.
      // Keeping them relative is important: absolute paths would bypass Vortex deployment.
      void destinationPath;
      return { instructions } as any;
    },
  );

  context.registerModType(
    "thunderstore-valheim",
    10,
    (gameId) => gameId === VALHEIM_GAME_ID,
    () => activeGameRoot(api, VALHEIM_GAME_ID),
    async (instructions) => isValheimThunderstoreInstructions(instructions),
  );

}
