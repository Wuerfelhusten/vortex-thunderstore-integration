import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { ArchiveEntryInfo } from "./security-types";

const WINDOWS_RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;

export class UnsafeInputError extends Error {
  readonly code = "UNSAFE_ARCHIVE" as const;
}

export interface ArchiveLimits {
  maxEntries: number;
  maxUncompressedBytes: number;
  maxCompressionRatio: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 100_000,
  maxUncompressedBytes: 4 * 1024 * 1024 * 1024,
  maxCompressionRatio: 200,
};

function normalizeArchivePath(input: string): string {
  if (!input || /[\u0000-\u001f\u007f]/u.test(input)) {
    throw new UnsafeInputError("Archive entry contains control characters");
  }
  const replaced = input.replaceAll("\\", "/");
  if (replaced.startsWith("/") || replaced.startsWith("//") || /^[A-Za-z]:/u.test(replaced)) {
    throw new UnsafeInputError(`Absolute archive path rejected: ${input}`);
  }
  const parts = replaced.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === ".." || part.includes(":"))) {
    throw new UnsafeInputError(`Traversal or ADS archive path rejected: ${input}`);
  }
  if (parts.some((part) => WINDOWS_RESERVED.test(part))) {
    throw new UnsafeInputError(`Reserved Windows archive name rejected: ${input}`);
  }
  if (parts.length === 0) throw new UnsafeInputError("Empty archive path rejected");
  return parts.join("/");
}

export function validateArchiveEntries(
  entries: readonly ArchiveEntryInfo[],
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): { entries: Array<ArchiveEntryInfo & { normalizedPath: string }>; totalBytes: number } {
  if (entries.length > limits.maxEntries) {
    throw new UnsafeInputError("Archive contains too many entries");
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const normalized = entries.map((entry) => {
    const normalizedPath = normalizeArchivePath(entry.path);
    const key = normalizedPath.toLocaleLowerCase("en-US");
    if (seen.has(key)) throw new UnsafeInputError(`Case-insensitive path collision: ${entry.path}`);
    seen.add(key);
    if (entry.kind === "symlink" || entry.kind === "hardlink") {
      throw new UnsafeInputError(`Archive links are not accepted: ${entry.path}`);
    }
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
      throw new UnsafeInputError(`Invalid archive size: ${entry.path}`);
    }
    totalBytes += entry.uncompressedSize;
    if (totalBytes > limits.maxUncompressedBytes) throw new UnsafeInputError("Archive is too large");
    if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio) {
      throw new UnsafeInputError(`Compression ratio too high: ${entry.path}`);
    }
    return { ...entry, normalizedPath };
  });
  return { entries: normalized, totalBytes };
}

export function validateRemoteUrl(value: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeInputError("Invalid download URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new UnsafeInputError("Only credential-free HTTPS URLs without custom ports are accepted");
  }
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new UnsafeInputError(`Download host is not allowlisted: ${url.hostname}`);
  }
  if (url.pathname.split("/").some((part) => part === "..")) {
    throw new UnsafeInputError("Download URL contains traversal");
  }
  return url;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}
