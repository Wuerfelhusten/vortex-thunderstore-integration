import { ThunderstoreApiClient } from "../api";
import { ThunderstoreVersionRecord } from "../types";
import { packageIdentity, versionIdentity } from "../identity";
import { parseDependency } from "../dependencies";

function toRecord(value: Record<string, unknown>, community: string, namespace: string, name: string, version: string): ThunderstoreVersionRecord | undefined {
  const fileSize = typeof value.file_size === "number"
    ? value.file_size
    : typeof value.size === "number" ? value.size : undefined;
  if (typeof value.download_url !== "string" || fileSize === undefined) return undefined;
  const identity = packageIdentity(namespace, name, typeof value.package_uuid === "string" ? value.package_uuid : undefined);
  const versionId = versionIdentity(identity, version, typeof value.uuid === "string" ? value.uuid : undefined);
  const dependencies = Array.isArray(value.dependencies)
    ? value.dependencies.flatMap((dependency) => {
      if (typeof dependency !== "string") return [];
      try { return [parseDependency(dependency, community)]; } catch { return []; }
    })
    : [];
  return {
    identity: versionId,
    listing: { version: versionId, community },
    description: typeof value.description === "string" ? value.description : undefined,
    author: typeof value.team === "object" && value.team !== null && typeof (value.team as { name?: unknown }).name === "string" ? (value.team as { name: string }).name : undefined,
    websiteUrl: typeof value.website_url === "string" ? value.website_url : undefined,
    iconUrl: typeof value.icon_url === "string" ? value.icon_url : undefined,
    downloadUrl: value.download_url,
    fileName: typeof value.full_version_name === "string" ? `${value.full_version_name}.zip` : `${namespace}-${name}-${version}.zip`,
    fileSize,
    dependencies,
    dependenciesComplete: false,
    isActive: value.is_active !== false,
    isDeprecated: value.is_deprecated === true,
    categories: Array.isArray(value.categories) ? value.categories.filter((category): category is string => typeof category === "string") : undefined,
    raw: value,
  };
}

function parseFullDependency(value: unknown, community: string): ReturnType<typeof parseDependency> | undefined {
  if (typeof value === "string") {
    try { return parseDependency(value, community); } catch { return undefined; }
  }
  if (typeof value !== "object" || value === null) return undefined;
  const item = value as { namespace?: unknown; name?: unknown; package_name?: unknown; version_number?: unknown; version?: unknown; community_identifier?: unknown };
  const namespace = typeof item.namespace === "string" ? item.namespace : undefined;
  const name = typeof item.name === "string" ? item.name : typeof item.package_name === "string" ? item.package_name : undefined;
  const version = typeof item.version_number === "string" ? item.version_number : typeof item.version === "string" ? item.version : undefined;
  if (namespace === undefined || name === undefined || version === undefined) return undefined;
  try { return parseDependency(`${namespace}-${name}-${version}`, typeof item.community_identifier === "string" ? item.community_identifier : community); } catch { return undefined; }
}

export async function loadVersionRecord(client: ThunderstoreApiClient, namespace: string, name: string, version: string, community: string): Promise<ThunderstoreVersionRecord | undefined> {
  const raw = await client.getPackageVersion(namespace, name, version);
  const record = toRecord(raw, community, namespace, name, version);
  if (record === undefined) return undefined;
  const dependencyValues = await client.getFullDependencies(namespace, name, version);
  const dependencies = dependencyValues.map((value) => parseFullDependency(value, community));
  if (dependencies.some((dependency) => dependency === undefined)) return undefined;
  const downloadUrl = client.resolveDownloadUrl(record.downloadUrl).href;
  return { ...record, downloadUrl, dependencies: dependencies as NonNullable<typeof dependencies[number]>[], dependenciesComplete: true };
}

