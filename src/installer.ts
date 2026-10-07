import { validateArchiveEntries, UnsafeInputError } from "./security";
import { AdapterBinding, CatalogEntry } from "./types";
import { VALHEIM_ADAPTER_ID, buildValheimInstallInstructions, supportsValheimArchive } from "./valheim";

export interface InstallInstruction {
  type: "copy";
  source: string;
  destination: string;
}

function matchesPrefix(path: string, prefix: string): boolean {
  const normalizedPrefix = prefix.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`);
}

export function adapterSupportsFiles(files: readonly string[], gameId: string, entry: CatalogEntry): boolean {
  if (!entry.adapter || !entry.vortexGameIds.includes(gameId) || !entry.capabilities.includes("install")) return false;
  if (entry.adapter.id === VALHEIM_ADAPTER_ID) return supportsValheimArchive(files);
  try {
    const checked = validateArchiveEntries(files.map((path) => ({ path, kind: "file" as const, compressedSize: 1, uncompressedSize: 1 })));
    const adapter = entry.adapter;
    const allowedStandalone = new Set(adapter.allowedStandaloneFiles ?? []);
    return checked.entries.some(({ normalizedPath }) =>
      adapter.archivePrefixes.some((prefix) => matchesPrefix(normalizedPath, prefix)) || allowedStandalone.has(normalizedPath),
    );
  } catch {
    return false;
  }
}

export function buildInstallInstructions(files: readonly string[], gameId: string, entry: CatalogEntry): InstallInstruction[] {
  if (!adapterSupportsFiles(files, gameId, entry) || entry.adapter === undefined) {
    throw new UnsafeInputError("No qualified Thunderstore adapter for this archive and game");
  }
  if (entry.adapter.id === VALHEIM_ADAPTER_ID) return buildValheimInstallInstructions(files);
  const adapter: AdapterBinding = entry.adapter;
  const allowedStandalone = new Set(adapter.allowedStandaloneFiles ?? []);
  const checked = validateArchiveEntries(files.map((path) => ({ path, kind: "file" as const, compressedSize: 1, uncompressedSize: 1 })));
  const unsupported = checked.entries.filter(({ normalizedPath }) =>
    !adapter.archivePrefixes.some((prefix) => matchesPrefix(normalizedPath, prefix)) && !allowedStandalone.has(normalizedPath),
  );
  if (unsupported.length > 0) {
    throw new UnsafeInputError(`Archive contains files outside the declared adapter roots: ${unsupported[0].normalizedPath}`);
  }
  return checked.entries.map(({ path, normalizedPath }) => ({ type: "copy", source: path, destination: normalizedPath }));
}
