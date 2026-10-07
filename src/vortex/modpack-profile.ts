import { randomUUID } from "node:crypto";
import { actions, selectors, types } from "@nexusmods/vortex-api";

export interface ProfileChoice { gameId: string; profileId?: string; name: string }

export async function chooseModpackProfile(api: types.IExtensionApi, gameId: string, name: string): Promise<ProfileChoice | undefined> {
  if (!api.showDialog) throw new Error("Vortex-Profildialog ist nicht verfügbar");
  const profiles = Object.values(api.getState().persistent.profiles ?? {}).filter((p) => p.gameId === gameId && !p.pendingRemove);
  const active = selectors.activeProfile(api.getState());
  const result = await api.showDialog("question", "Thunderstore-Modpack installieren", {
    text: `${name}: In welches Profil soll das Modpack installiert werden? Ein neues Profil beginnt ohne aktivierte Mods.`,
    choices: [
      ...profiles.map((p) => ({ id: p.id, text: p.name + (p.id === active?.id ? " (Aktuell)" : ""), value: p.id === active?.id })),
      { id: "__new", text: "Neues Profil erstellen", value: !profiles.some((p) => p.id === active?.id) },
    ],
  }, [{ label: "Abbrechen" }, { label: "Weiter", default: true }]);
  if (result.action !== "Weiter") return undefined;
  const selected = [...profiles.map((p) => p.id), "__new"].filter((id) => result.input?.[id] === true);
  if (selected.length !== 1) throw new Error("Bitte genau ein Zielprofil auswählen");
  return { gameId, name, profileId: selected[0] === "__new" ? undefined : selected[0] };
}

export function assertProfile(api: types.IExtensionApi, gameId: string, profileId: string): types.IProfile {
  const profile = api.getState().persistent.profiles?.[profileId];
  if (!profile || profile.gameId !== gameId || profile.pendingRemove) throw new Error("Das gewählte Zielprofil ist nicht mehr verfügbar");
  return profile;
}

export async function prepareModpackProfile(api: types.IExtensionApi, choice: ProfileChoice): Promise<types.IProfile | undefined> {
  if (!api.store || !api.showDialog) throw new Error("Vortex-Profilverwaltung ist nicht verfügbar");
  let profileId = choice.profileId;
  const profile = profileId === undefined ? undefined : assertProfile(api, choice.gameId, profileId);
  let switchProfile = false;
  if (profileId === undefined || selectors.activeProfile(api.getState())?.id !== profileId) {
    const result = await api.showDialog("question", "Zielprofil", {
      text: `Das Modpack wird in „${profile?.name ?? choice.name}“ installiert. Möchtest du zu diesem Profil wechseln?`,
    }, [{ label: "Abbrechen" }, { label: "Nein" }, { label: "Ja", default: true }]);
    if (result.action !== "Ja" && result.action !== "Nein") return undefined;
    switchProfile = result.action === "Ja";
  }
  // Do not leave an empty profile behind when the dialog is cancelled/closed.
  if (profileId === undefined) {
    profileId = randomUUID();
    api.store.dispatch(actions.setProfile({ id: profileId, gameId: choice.gameId, name: choice.name, modState: {}, lastActivated: 0 }));
    api.store.dispatch(actions.setProfilesVisible(true));
  }
  if (switchProfile) {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer);
          api.events.removeListener("profile-did-change", changed);
          if (error) reject(error); else resolve();
        };
        const changed = (id: string) => {
          if (id !== profileId) return finish(new Error("Vortex hat ein anderes Profil aktiviert; Installation angehalten"));
          finish();
        };
        const timer = setTimeout(() => finish(new Error("Profilwechsel nicht abgeschlossen; bitte erneut versuchen")), 45000);
        api.events.on("profile-did-change", changed);
        try { api.store!.dispatch(actions.setNextProfile(profileId!)); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
      });
  }
  return assertProfile(api, choice.gameId, profileId);
}
