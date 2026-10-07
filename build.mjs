import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const packageInfo = JSON.parse(await readFile("package.json", "utf8"));

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false,
  external: ["@nexusmods/vortex-api", "react", "react-dom"],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

// Vortex's extension installer accepts index.js/info.json at the package root;
// the runtime also supports index.cjs. Keep both outputs in dist so the build
// directory can be copied directly into Vortex's user plugin directory.
await copyFile("dist/index.cjs", "dist/index.js");
await mkdir("dist/assets", { recursive: true });
await copyFile("assets/thunderstore.svg", "dist/assets/thunderstore.svg");
await copyFile("assets/thunderstore.png", "dist/assets/thunderstore.png");
await copyFile("LICENSE", "dist/LICENSE");
await writeFile("dist/info.json", `${JSON.stringify({
  name: "Vortex Thunderstore Integration",
  author: "Modding Forge",
  version: packageInfo.version,
  description: packageInfo.description,
}, null, 2)}\n`, "utf8");
