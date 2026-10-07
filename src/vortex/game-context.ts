import { selectors, types } from "@nexusmods/vortex-api";

export function activeGameId(api: types.IExtensionApi): string | undefined {
  try {
    return selectors.activeGameId(api.getState());
  } catch {
    return undefined;
  }
}

export function activeGameRoot(api: types.IExtensionApi, gameId: string): string {
  const discovery = selectors.discoveryByGame(api.getState(), gameId);
  return discovery?.path ?? ".";
}
