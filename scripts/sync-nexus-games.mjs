import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workspace = process.cwd();
const envPath = path.join(workspace, ".env");
const outputPath = path.join(workspace, "data", "nexus-games.json");
const apiUrl = "https://api.nexusmods.com/v1/games.json";

function readEnvValue(contents, name) {
  const line = contents.split(/\r?\n/u).find((item) => new RegExp(`^\\s*${name}\\s*=`).test(item));
  if (line === undefined) return undefined;
  const value = line.replace(new RegExp(`^\\s*${name}\\s*=\\s*`), "").trim();
  return value.replace(/^(['"])(.*)\1$/u, "$2");
}

const env = await readFile(envPath, "utf8");
const apiKey = readEnvValue(env, "NEXUS_API_KEY");
if (!apiKey) throw new Error("NEXUS_API_KEY is missing or empty in .env");

const response = await fetch(apiUrl, {
  headers: {
    apikey: apiKey,
    Accept: "application/json",
    "User-Agent": "Vortex-Thunderstore/1.0.0",
  },
});
if (!response.ok) throw new Error(`Nexus API returned HTTP ${response.status}`);

const payload = await response.json();
if (!Array.isArray(payload)) throw new Error("Nexus API returned an unexpected game-list shape");

const games = payload.map((game) => ({
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

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  source: apiUrl,
  retrievedAt: new Date().toISOString(),
  count: games.length,
  games,
}, null, 2)}\n`, "utf8");

console.log(`Synchronized ${games.length} Nexus games to ${path.relative(workspace, outputPath)}`);
