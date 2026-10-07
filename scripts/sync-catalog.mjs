import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workspace = process.cwd();
const dataDirectory = path.join(workspace, "data");
const nexusUrl = "https://api.nexusmods.com/v1/games.json";
const thunderstoreUrl = "https://thunderstore.io/api/cyberstorm/community/";
const vortexExtensionUrl = "https://raw.githubusercontent.com/Nexus-Mods/Vortex-Backend/main/out/extensions-manifest.json";
const userAgent = "Vortex-Thunderstore/1.0.0";

function readEnvValue(contents, name) {
  const line = contents.split(/\r?\n/u).find((item) => new RegExp(`^\\s*${name}\\s*=`).test(item));
  if (line === undefined) return undefined;
  const value = line.replace(new RegExp(`^\\s*${name}\\s*=\\s*`), "").trim();
  return value.replace(/^(['"])(.*)\1$/u, "$2");
}

function normalizeMatchKey(value) {
  return String(value ?? "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]/gu, "");
}

const romanNumerals = new Map([
  ["i", "1"],
  ["ii", "2"],
  ["iii", "3"],
  ["iv", "4"],
  ["v", "5"],
  ["vi", "6"],
  ["vii", "7"],
  ["viii", "8"],
  ["ix", "9"],
  ["x", "10"],
]);

function normalizeSemanticMatchKey(value) {
  return (String(value ?? "").toLocaleLowerCase("en-US").match(/[a-z]+|[0-9]+/gu) ?? [])
    .map((token) => romanNumerals.get(token) ?? token)
    .filter((token) => token !== "the")
    .join("");
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": userAgent, ...headers } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function getAllThunderstoreCommunities() {
  const results = [];
  const seen = new Set();
  let next = thunderstoreUrl;
  while (next !== undefined && next !== null && next !== "") {
    const parsed = new URL(next);
    if (parsed.origin !== "https://thunderstore.io") throw new Error("Thunderstore pagination left the official host");
    if (seen.has(parsed.href)) throw new Error("Thunderstore pagination loop detected");
    seen.add(parsed.href);
    const page = await getJson(parsed.href);
    if (!page || !Array.isArray(page.results)) throw new Error("Unexpected Thunderstore community response");
    results.push(...page.results);
    next = page.next;
  }
  return results;
}

const env = await readFile(path.join(workspace, ".env"), "utf8").catch(() => "");
const nexusApiKey = readEnvValue(env, "NEXUS_API_KEY") || process.env.NEXUS_API_KEY;

const retrievedAt = new Date().toISOString();
const nexusPayload = nexusApiKey === undefined
  ? (await readFile(path.join(dataDirectory, "nexus-games.json"), "utf8").then((value) => JSON.parse(value))).games
  : await getJson(nexusUrl, { apikey: nexusApiKey });
if (!Array.isArray(nexusPayload)) throw new Error("Unexpected Nexus game response or cache");
const nexusGames = nexusPayload.map((game) => ({
  nexusGameId: game.id,
  name: game.name,
  nexusDomain: game.domain_name,
  genre: game.genre ?? null,
  approvedDate: game.approved_date ?? null,
  fileCount: game.file_count ?? null,
  modCount: game.mods ?? null,
  downloads: game.downloads ?? null,
  categories: Array.isArray(game.categories) ? game.categories : [],
})).sort((a, b) => String(a.nexusDomain).localeCompare(String(b.nexusDomain)));

const thunderstorePayload = await getAllThunderstoreCommunities();
const thunderstoreCommunities = thunderstorePayload.map((community) => ({
  community: community.identifier,
  name: community.name,
  shortDescription: community.short_description ?? null,
  listed: community.is_listed === true,
  hasModManagerSupport: community.has_mod_manager_support === true,
  totalPackageCount: community.total_package_count ?? null,
  totalDownloadCount: community.total_download_count ?? null,
  createdAt: community.datetime_created ?? null,
  wikiUrl: community.wiki_url ?? null,
  discordUrl: community.discord_url ?? null,
})).sort((a, b) => a.community.localeCompare(b.community));

const vortexExtensionPayload = await getJson(vortexExtensionUrl);
if (!vortexExtensionPayload || !Array.isArray(vortexExtensionPayload.extensions)) {
  throw new Error("Unexpected Vortex extension manifest response");
}
const vortexGameExtensions = vortexExtensionPayload.extensions
  .filter((extension) => extension?.type === "game" && typeof extension.gameId === "string")
  .map((extension) => ({
    gameId: extension.gameId,
    name: typeof extension.name === "string" ? extension.name : extension.gameId,
    version: typeof extension.version === "string" ? extension.version : undefined,
    modId: typeof extension.modId === "number" ? extension.modId : undefined,
    fileId: typeof extension.fileId === "number" ? extension.fileId : undefined,
  }));
const vortexExtensionsByGame = new Map();
for (const extension of vortexGameExtensions) {
  const existing = vortexExtensionsByGame.get(extension.gameId) ?? [];
  existing.push(extension);
  vortexExtensionsByGame.set(extension.gameId, existing);
}

const nexusByDomain = new Map(nexusGames.map((game) => [game.nexusDomain, game]));
const nexusByNormalizedDomain = new Map(nexusGames.map((game) => [normalizeMatchKey(game.nexusDomain), game]));
const nexusByName = new Map();
const nexusBySemanticName = new Map();
for (const game of nexusGames) {
  const key = normalizeMatchKey(game.name);
  if (key.length === 0) continue;
  const matches = nexusByName.get(key) ?? [];
  matches.push(game);
  nexusByName.set(key, matches);

  const semanticKey = normalizeSemanticMatchKey(game.name);
  if (semanticKey.length === 0) continue;
  const semanticMatches = nexusBySemanticName.get(semanticKey) ?? [];
  semanticMatches.push(game);
  nexusBySemanticName.set(semanticKey, semanticMatches);
}
const candidates = thunderstoreCommunities.map((community) => {
  const exactNexusGame = nexusByDomain.get(community.community);
  const normalizedIdNexusGame = nexusByNormalizedDomain.get(normalizeMatchKey(community.community));
  const namedNexusMatches = nexusByName.get(normalizeMatchKey(community.name)) ?? [];
  const semanticNameMatches = nexusBySemanticName.get(normalizeSemanticMatchKey(community.name)) ?? [];
  const nexusGame = exactNexusGame
    ?? normalizedIdNexusGame
    ?? (namedNexusMatches.length === 1 ? namedNexusMatches[0] : undefined)
    ?? (semanticNameMatches.length === 1 ? semanticNameMatches[0] : undefined);
  const vortexExtensions = nexusGame === undefined ? [] : vortexExtensionsByGame.get(nexusGame.nexusDomain) ?? [];
  const nexusMatchEvidence = exactNexusGame !== undefined
    ? []
    : normalizedIdNexusGame !== undefined
      ? ["nexus-id-match"]
      : namedNexusMatches.length === 1 && nexusGame !== undefined
        ? ["nexus-name-match"]
        : semanticNameMatches.length === 1 && nexusGame !== undefined
          ? ["nexus-semantic-name-match"]
          : [];
  const evidence = ["thunderstore-community-api", ...(nexusGame === undefined ? [] : ["nexus-games-api"]), ...nexusMatchEvidence, ...(vortexExtensions.length === 0 ? [] : ["vortex-extension-manifest"])];
  const hasVortexSupport = vortexExtensions.length > 0;
  const status = !community.listed
    ? "retired"
    : nexusGame === undefined
      ? "no-nexus-match"
      : !hasVortexSupport
        ? "no-vortex-support"
        : "verified";
  return {
    mappingKey: `candidate:${community.community}`,
    ecosystemId: community.community,
    community: community.community,
    name: community.name,
    ...(nexusGame === undefined ? {} : { nexusDomain: nexusGame.nexusDomain, nexusGameId: nexusGame.nexusGameId }),
    vortexGameIds: [...new Set(vortexExtensions.map((extension) => extension.gameId))],
    status,
    capabilities: status === "verified" ? ["browse", "download", "install", "dependencies", "updates"] : [],
    mappingVersion: status === "verified" ? `vortex-extension-${vortexExtensions[0]?.version ?? retrievedAt}` : `candidate-${retrievedAt}`,
    evidence,
    reviewedAt: retrievedAt,
    reviewer: "automated-api-sync",
  };
});

const dualPlatformCandidates = candidates.filter((candidate) => candidate.nexusGameId !== undefined);
const existingCatalog = await readFile(path.join(dataDirectory, "catalog.json"), "utf8")
  .then((value) => JSON.parse(value))
  .catch(() => undefined);
const existingByCommunity = new Map((existingCatalog?.entries ?? []).map((entry) => [entry.community, entry]));
const qualifiedEntries = candidates.filter((candidate) => candidate.status === "verified").map((candidate) => {
  const existing = existingByCommunity.get(candidate.community);
  if (existing === undefined) return candidate;
  const merged = { ...candidate };
  for (const key of ["mappingKey", "ecosystemId", "variant", "edition", "mappingVersion", "adapter", "reviewedAt", "reviewer"]) {
    if (existing[key] !== undefined) merged[key] = existing[key];
  }
  merged.evidence = [...new Set([...candidate.evidence, ...(existing.evidence ?? [])])];
  return merged;
});

await mkdir(dataDirectory, { recursive: true });
await writeFile(path.join(dataDirectory, "nexus-games.json"), `${JSON.stringify({ schemaVersion: 1, source: nexusUrl, retrievedAt, count: nexusGames.length, games: nexusGames }, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDirectory, "thunderstore-communities.json"), `${JSON.stringify({ schemaVersion: 1, source: thunderstoreUrl, retrievedAt, count: thunderstoreCommunities.length, communities: thunderstoreCommunities }, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDirectory, "catalog-candidates.json"), `${JSON.stringify({ schemaVersion: 1, snapshotId: `api-candidate-${retrievedAt.slice(0, 10)}`, generatedAt: retrievedAt, entries: candidates }, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDirectory, "catalog-dual-platform.json"), `${JSON.stringify({ schemaVersion: 1, snapshotId: `dual-platform-${retrievedAt.slice(0, 10)}`, generatedAt: retrievedAt, filter: "exact/normalized Nexus ID or unique normalized/semantic Nexus game-name match + Thunderstore community identifier", entries: dualPlatformCandidates }, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDirectory, "catalog.json"), `${JSON.stringify({ schemaVersion: 1, snapshotId: `qualified-${retrievedAt.slice(0, 10)}`, generatedAt: retrievedAt, filter: "exact/normalized Nexus ID or unique normalized/semantic Nexus game-name match + Thunderstore community identifier + Vortex game extension", entries: qualifiedEntries }, null, 2)}\n`, "utf8");

const exactNexusMatches = candidates.filter((candidate) => candidate.nexusGameId !== undefined).length;
console.log(`Synchronized ${nexusGames.length} Nexus games, ${thunderstoreCommunities.length} Thunderstore communities and ${vortexGameExtensions.length} Vortex game extensions.`);
console.log(`Generated ${candidates.length} candidates; ${exactNexusMatches} are dual-platform and ${qualifiedEntries.length} are qualified for this extension.`);
