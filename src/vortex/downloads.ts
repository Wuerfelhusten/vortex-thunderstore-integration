import { types } from "@nexusmods/vortex-api";
import { VortexLookupData } from "../metadata";
import { pickThunderstoreMirror } from "../download-mirror";
import { InstallDownloadOptions } from "./contracts";

export function toDownloadInfo(lookup: VortexLookupData, isModpack = false): Record<string, unknown> {
  return {
    ...lookup,
    game: lookup.gameId,
    ...(isModpack ? { thunderstoreModpack: true } : {}),
    ids: { modId: lookup.details.modId, fileId: lookup.details.fileId },
    meta: { ...lookup.meta, details: lookup.details },
  };
}

export async function downloadAndInstall(
  api: types.IExtensionApi, lookup: VortexLookupData,
  options: { isModpack?: boolean; install?: boolean | InstallDownloadOptions; guard?: () => void } = {},
): Promise<string | undefined> {
  options.guard?.();
  const url = await pickThunderstoreMirror(lookup.sourceURI);
  options.guard?.();
  const id = await startVortexDownload(api, url, toDownloadInfo(lookup, options.isModpack), lookup.fileName);
  options.guard?.();
  return installVortexDownload(api, id, options.install ?? true);
}

export function startVortexDownload(
  api: types.IExtensionApi,
  url: string,
  modInfo: Record<string, unknown>,
  fileName: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    api.events.emit(
      "start-download",
      [url],
      modInfo,
      fileName,
      (error: Error | null, downloadId?: string) => {
        if (error !== null) {
          reject(error);
          return;
        }
        if (downloadId === undefined) {
          reject(new Error("Vortex returned no download id"));
          return;
        }
        resolve(downloadId);
      },
      "never",
      { allowInstall: false },
    );
  });
}

export function installVortexDownload(api: types.IExtensionApi, downloadId: string, options: boolean | InstallDownloadOptions = true): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    api.events.emit(
      "start-install-download",
      downloadId,
      options,
      (error: Error | null, modId?: string) => {
        if (error !== null) reject(error);
        else resolve(modId);
      },
    );
  });
}
