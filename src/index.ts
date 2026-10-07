import { types } from "@nexusmods/vortex-api";
import catalogData from "../data/catalog.json";
import { ThunderstoreApiClient } from "./api";
import { GameCatalog } from "./catalog";
import { CatalogSnapshot } from "./types";
import { registerVortexBridge } from "./vortex/register";

export default function main(context: types.IExtensionContext): boolean {
  const catalog = new GameCatalog(catalogData as CatalogSnapshot);
  const client = new ThunderstoreApiClient();
  registerVortexBridge(context, catalog, client);
  return true;
}
