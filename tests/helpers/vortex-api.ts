import React from "react";
import { vi } from "vitest";

export const Icon = ({ name, ...props }: { name: string }) => React.createElement("i", { "data-icon": name, ...props });
export const actions = {
  removeModRule: (gameId: string, modId: string, rule: unknown) => ({ type: "removeModRule", gameId, modId, rule }),
  setProfile: (profile: unknown) => ({ type: "setProfile", profile }),
  setProfilesVisible: (value: boolean) => ({ type: "setProfilesVisible", value }),
  setNextProfile: (id: string) => ({ type: "setNextProfile", id }),
  setModEnabled: (profileId: string, modId: string, value: boolean) => ({ type: "setModEnabled", profileId, modId, value }),
  addModRule: (gameId: string, modId: string, rule: unknown) => ({ type: "addModRule", gameId, modId, rule }),
  setModAttribute: (gameId: string, modId: string, attribute: string, value: unknown) => ({ gameId, modId, attribute, value }),
};
export const selectors = {
  activeProfile: (state: any) => state.persistent.profiles?.[state.settings?.profiles?.activeProfileId],
  downloadPathForGame: () => "C:/downloads/valheim",
  activeGameId: (): string | undefined => "valheim",
  discoveryByGame: () => ({ path: "C:/games/valheim" }),
};
export const util = {
  opn: vi.fn().mockResolvedValue(undefined),
  installIconSet: vi.fn().mockResolvedValue(undefined),
};
