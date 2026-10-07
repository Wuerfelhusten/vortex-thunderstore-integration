import { PackageIdentity, THUNDERSTORE_SOURCE, VersionIdentity } from "./types";

export function normalizeIdentifier(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${field} is empty or contains control characters`);
  }
  return normalized;
}

function keyPart(value: string): string {
  return encodeURIComponent(value);
}

export function packageIdentity(namespace: string, name: string, packageUuid?: string): PackageIdentity {
  return {
    repository: THUNDERSTORE_SOURCE,
    namespace: normalizeIdentifier(namespace, "namespace"),
    name: normalizeIdentifier(name, "package name"),
    ...(packageUuid === undefined ? {} : { packageUuid: normalizeIdentifier(packageUuid, "package UUID") }),
  };
}

export function packageKey(identity: PackageIdentity): string {
  return [identity.repository, identity.namespace, identity.name].map(keyPart).join(":");
}

export function versionIdentity(
  identity: PackageIdentity,
  version: string,
  versionUuid?: string,
): VersionIdentity {
  return {
    package: identity,
    version: normalizeIdentifier(version, "version"),
    ...(versionUuid === undefined ? {} : { versionUuid: normalizeIdentifier(versionUuid, "version UUID") }),
  };
}

export function versionKey(identity: VersionIdentity): string {
  return `${packageKey(identity.package)}:${keyPart(identity.version)}`;
}

export function listingKey(identity: VersionIdentity, community: string): string {
  return `${versionKey(identity)}:${keyPart(normalizeIdentifier(community, "community"))}`;
}

export function isSamePackage(a: PackageIdentity, b: PackageIdentity): boolean {
  return packageKey(a) === packageKey(b);
}
