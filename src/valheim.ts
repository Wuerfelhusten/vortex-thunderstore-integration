import { validateArchiveEntries, UnsafeInputError } from "./security";
import { AdapterBinding } from "./types";

export const VALHEIM_GAME_ID = "valheim";
export const VALHEIM_COMMUNITY = "valheim";
export const VALHEIM_NEXUS_DOMAIN = "valheim";
export const VALHEIM_STEAM_APP_ID = "892970";
export const VALHEIM_ADAPTER_ID = "valheim-bepinex";
export const VALHEIM_ADAPTER_VERSION = "1.0.0";

export const VALHEIM_ADAPTER: AdapterBinding = {
  id: VALHEIM_ADAPTER_ID,
  version: VALHEIM_ADAPTER_VERSION,
  loader: "bepinex",
  archivePrefixes: [
    "BepInEx/plugins",
    "BepInEx/config",
    "BepInEx/patchers",
    "plugins",
    "config",
    "patchers",
  ],
  allowedStandaloneFiles: ["manifest.json", "README.md", "CHANGELOG.md", "icon.png"],
};

export interface ValheimInstallInstruction {
  type: "copy";
  source: string;
  destination: string;
}

const PACKAGE_METADATA = new Set(["manifest.json", "readme.md", "changelog.md", "icon.png"]);
const INSTALL_ROOTS = new Set(["plugins", "config", "patchers"]);
const LOADER_ROOT_FILES = new Set([
  "winhttp.dll",
  "doorstop_config.ini",
  ".doorstop_version",
  "start_game_bepinex.sh",
  "start_server_bepinex.sh",
]);

interface NormalizedFile {
  source: string;
  path: string;
}

function asNormalizedFiles(files: readonly string[]): NormalizedFile[] {
  return validateArchiveEntries(files.map((path) => ({
    path,
    kind: "file" as const,
    compressedSize: 1,
    uncompressedSize: 1,
  }))).entries.map((entry) => ({ source: entry.path, path: entry.normalizedPath }));
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function extension(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLocaleLowerCase("en-US");
}

function isMetadata(path: string): boolean {
  return PACKAGE_METADATA.has(basename(path).toLocaleLowerCase("en-US"));
}

function isLoaderFile(path: string): boolean {
  const parts = path.toLocaleLowerCase("en-US").split("/");
  const bepinexIndex = parts.indexOf("bepinex");
  return parts.includes("doorstop_libs")
    || (bepinexIndex !== -1 && parts[bepinexIndex + 1] === "core")
    || LOADER_ROOT_FILES.has(parts[parts.length - 1] ?? "");
}

function stripSinglePackageContainer(files: NormalizedFile[]): NormalizedFile[] {
  const payload = files.filter((file) => !isMetadata(file.path));
  const topLevels = new Set(payload.map((file) => file.path.split("/")[0]?.toLocaleLowerCase("en-US")));
  if (topLevels.size !== 1) return files;
  const topLevel = [...topLevels][0];
  if (topLevel === undefined || topLevel === "bepinex" || INSTALL_ROOTS.has(topLevel)) return files;
  return files.map((file) => {
    const prefix = `${topLevel}/`;
    return file.path.toLocaleLowerCase("en-US") === topLevel || !file.path.toLocaleLowerCase("en-US").startsWith(prefix)
      ? file
      : { ...file, path: file.path.slice(prefix.length) };
  });
}

function pathAfterSegment(path: string, segment: string): string | undefined {
  const parts = path.split("/");
  const index = parts.findIndex((part) => part.toLocaleLowerCase("en-US") === segment);
  if (index === -1 || index === parts.length - 1) return undefined;
  return parts.slice(index + 1).join("/");
}

function preserveBepInExPath(path: string): string | undefined {
  const parts = path.split("/");
  const bepinexIndex = parts.findIndex((part) => part.toLocaleLowerCase("en-US") === "bepinex");
  if (bepinexIndex === -1 || bepinexIndex === parts.length - 1) return undefined;
  const root = parts[bepinexIndex + 1]?.toLocaleLowerCase("en-US");
  return root !== undefined && INSTALL_ROOTS.has(root) ? parts.slice(bepinexIndex).join("/") : undefined;
}

function mapKnownRoot(path: string): string | undefined {
  const preserved = preserveBepInExPath(path);
  if (preserved !== undefined) return preserved;
  for (const root of INSTALL_ROOTS) {
    const relative = pathAfterSegment(path, root);
    if (relative !== undefined) return `BepInEx/${root}/${relative}`;
  }
  return undefined;
}

function cleanModDirectory(name: string): string {
  const cleaned = name
    .replace(/\.dll$/iu, "")
    .replace(/[<>:"/\\|?*]/gu, "")
    .replace(/[. ]+$/gu, "")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") throw new UnsafeInputError("Valheim package has no safe plugin directory name");
  return cleaned;
}

export function isValheimLoaderArchive(files: readonly string[]): boolean {
  try {
    return asNormalizedFiles(files).some((file) => isLoaderFile(file.path));
  } catch {
    return true;
  }
}

export function buildValheimInstallInstructions(files: readonly string[]): ValheimInstallInstruction[] {
  const validated = asNormalizedFiles(files);
  if (!validated.some((file) => basename(file.path).toLocaleLowerCase("en-US") === "manifest.json")) {
    throw new UnsafeInputError("Valheim Thunderstore packages must contain manifest.json");
  }
  if (validated.some((file) => isLoaderFile(file.path))) {
    throw new UnsafeInputError("Valheim loader packages are delegated to the installed Valheim game extension");
  }

  const filesWithoutContainer = stripSinglePackageContainer(validated);
  const payload = filesWithoutContainer.filter((file) => !isMetadata(file.path));
  const rootDll = payload.find((file) => !file.path.includes("/") && extension(file.path) === ".dll");
  const primaryDll = rootDll ?? payload.find((file) => extension(file.path) === ".dll");
  const loosePluginDirectory = primaryDll === undefined ? undefined : cleanModDirectory(basename(primaryDll.path));
  const instructions: ValheimInstallInstruction[] = [];
  const destinations = new Set<string>();

  for (const file of payload) {
    // A root DLL and its plugins/ assets belong together; explicit BepInEx
    // paths and packages without a root DLL retain their existing layout.
    const knownDestination = rootDll !== undefined && /^plugins\//iu.test(file.path)
      ? `BepInEx/plugins/${loosePluginDirectory}/${file.path.slice("plugins/".length)}`
      : mapKnownRoot(file.path);
    const destination = knownDestination
      ?? (extension(file.path) === ".cfg"
        ? `BepInEx/config/${file.path}`
        : loosePluginDirectory === undefined
          ? undefined
          : `BepInEx/plugins/${loosePluginDirectory}/${file.path}`);
    if (destination === undefined) {
      throw new UnsafeInputError(`Unsupported Valheim package path: ${file.path}`);
    }
    const collisionKey = destination.toLocaleLowerCase("en-US");
    if (destinations.has(collisionKey)) throw new UnsafeInputError(`Valheim package destination collision: ${destination}`);
    destinations.add(collisionKey);
    instructions.push({ type: "copy", source: file.source, destination });
  }

  if (instructions.length === 0) throw new UnsafeInputError("Valheim package has no installable files");
  return instructions;
}

export function supportsValheimArchive(files: readonly string[]): boolean {
  try {
    buildValheimInstallInstructions(files);
    return true;
  } catch {
    return false;
  }
}
