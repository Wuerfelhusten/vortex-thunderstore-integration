import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The published Vortex API package provides types only. Vortex supplies
    // its runtime; unit tests use a local host double instead.
    alias: { "@nexusmods/vortex-api": fileURLToPath(new URL("./tests/helpers/vortex-api.ts", import.meta.url)) },
  },
});
