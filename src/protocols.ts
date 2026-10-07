import { ThunderstoreApiClient } from "./api";
import { packageIdentity, versionIdentity } from "./identity";
import { validateRemoteUrl, UnsafeInputError } from "./security";

export interface ParsedInstallLink {
  namespace: string;
  packageName: string;
  version: string;
}

export function parseRor2mmInstallLink(input: string): ParsedInstallLink {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeInputError("Invalid Thunderstore install link");
  }
  if (url.protocol !== "ror2mm:" || url.username || url.password) {
    throw new UnsafeInputError("Unsupported Thunderstore install link");
  }
  const pathParts = url.pathname.split("/").filter(Boolean);
  const parts = url.host === "v1" ? ["v1", ...pathParts] : pathParts;
  if (parts.length < 4 || parts[0] !== "v1" || parts[1] !== "install") {
    throw new UnsafeInputError("Unsupported Thunderstore install link shape");
  }
  const payload = parts.slice(2);
  let namespace: string;
  let packageName: string;
  let version = url.searchParams.get("version") ?? "";
  if (payload.length === 2) {
    [namespace, packageName] = payload;
  } else if (payload.length === 3) {
    [namespace, packageName, version] = payload;
  } else if (payload.length === 4 && payload[0] === "thunderstore.io") {
    [, namespace, packageName, version] = payload;
  } else if (payload.length === 5 && payload[0] === "https:" && payload[1] === "thunderstore.io") {
    [, , namespace, packageName, version] = payload;
  } else {
    throw new UnsafeInputError("Unsupported Thunderstore install link payload");
  }
  if (!version || version === "latest") throw new UnsafeInputError("Install link does not contain an exact version");
  return { namespace, packageName, version };
}

export async function resolveRor2mmInstallLink(input: string, client: ThunderstoreApiClient): Promise<{ urls: string[]; updatedUrl: string; meta: unknown }> {
  const parsed = parseRor2mmInstallLink(input);
  if (!parsed.version) throw new UnsafeInputError("Install link does not contain an exact version");
  const value = await client.getPackageVersion(parsed.namespace, parsed.packageName, parsed.version);
  if (typeof value.download_url !== "string") throw new UnsafeInputError("Thunderstore response has no download URL");
  const downloadUrl = validateRemoteUrl(value.download_url, client.allowedDownloadHosts);
  const identity = packageIdentity(parsed.namespace, parsed.packageName);
  const version = versionIdentity(identity, parsed.version);
  return {
    urls: [downloadUrl.href],
    updatedUrl: downloadUrl.href,
    meta: { source: "thunderstore", package: identity, version, originalUrl: input },
  };
}
