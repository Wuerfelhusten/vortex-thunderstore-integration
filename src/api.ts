import { validateRemoteUrl, UnsafeInputError } from "./security";

export class ThunderstoreApiError extends Error {
  constructor(
    readonly code: "API_UNAVAILABLE" | "API_SCHEMA_CHANGED" | "API_HTTP_ERROR",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ThunderstoreApiError";
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxAttempts?: number;
  timeoutMs?: number;
  allowedDownloadHosts?: readonly string[];
}

export interface JsonResponse<T> {
  value: T;
  etag?: string;
  lastModified?: string;
  notModified: boolean;
}

export interface Paged<T> {
  results: T[];
  next?: string;
  count?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(header: string | null, now: number): number {
  if (header === null) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, 10_000));
  const timestamp = Date.parse(header);
  return Number.isFinite(timestamp) ? Math.max(0, Math.min(timestamp - now, 10_000)) : 0;
}

export class ThunderstoreApiClient {
  private readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  readonly allowedDownloadHosts: readonly string[];

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? "https://thunderstore.io");
    // Chromium exposes fetch as a Window method. Calling the detached method
    // directly works in Node but throws "Illegal invocation" in Vortex.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.maxAttempts = options.maxAttempts ?? 4;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.allowedDownloadHosts = options.allowedDownloadHosts ?? [this.baseUrl.hostname, "gcdn.thunderstore.io", "ccdn.thunderstore.io"];
  }

  async getJson<T>(path: string, options: { signal?: AbortSignal; validate?: (value: unknown) => value is T } = {}): Promise<JsonResponse<T>> {
    const url = this.url(path);
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const abort = () => controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        const response = await this.fetchImpl(url, { headers: { Accept: "application/json" }, signal: controller.signal });
        if (response.status === 304) {
          return { value: undefined as T, etag: response.headers.get("etag") ?? undefined, lastModified: response.headers.get("last-modified") ?? undefined, notModified: true };
        }
        if (response.ok) {
          const value: unknown = await response.json();
          if (options.validate !== undefined && !options.validate(value)) {
            throw new ThunderstoreApiError("API_SCHEMA_CHANGED", `Unexpected API response for ${url.pathname}`);
          }
          return { value: value as T, etag: response.headers.get("etag") ?? undefined, lastModified: response.headers.get("last-modified") ?? undefined, notModified: false };
        }
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const error = new ThunderstoreApiError("API_HTTP_ERROR", `Thunderstore API returned HTTP ${response.status}`, response.status);
        if (!retryable || attempt >= this.maxAttempts) throw error;
        await this.sleep(retryAfterMs(response.headers.get("retry-after"), Date.now()) + Math.round(this.random() * 250));
        lastError = error;
      } catch (error) {
        lastError = error;
        const retryable = error instanceof ThunderstoreApiError
          ? error.status === 408 || error.status === 429 || (error.status !== undefined && error.status >= 500)
          : true;
        if (!retryable || attempt >= this.maxAttempts) {
          if (error instanceof ThunderstoreApiError) throw error;
          throw new ThunderstoreApiError("API_UNAVAILABLE", `Thunderstore API request failed: ${String(error)}`);
        }
        await this.sleep(Math.min(10_000, 250 * 2 ** (attempt - 1)) + Math.round(this.random() * 250));
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
      }
    }
    throw lastError instanceof Error ? lastError : new ThunderstoreApiError("API_UNAVAILABLE", "Thunderstore API request failed");
  }

  async getAllPages<T>(firstPath: string, validatePage?: (value: unknown) => value is Paged<T>): Promise<T[]> {
    const results: T[] = [];
    const seen = new Set<string>();
    let next: string | undefined = firstPath;
    while (next !== undefined) {
      const url = this.url(next);
      if (seen.has(url.href)) throw new ThunderstoreApiError("API_SCHEMA_CHANGED", "API pagination loop detected");
      seen.add(url.href);
      const response = await this.getJson<unknown>(url.pathname + url.search);
      const page = this.decodePage(response.value, validatePage);
      results.push(...page.results);
      if (page.next === undefined || page.next === "") break;
      const nextUrl = this.url(page.next);
      next = nextUrl.pathname + nextUrl.search;
    }
    return results;
  }

  async getPackageVersion(namespace: string, name: string, version: string): Promise<Record<string, unknown>> {
    return (await this.getJson<Record<string, unknown>>(`/api/cyberstorm/package/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}/`)).value;
  }

  async getFullDependencies(namespace: string, name: string, version: string): Promise<unknown[]> {
    const value = await this.getAllPages<unknown>(`/api/cyberstorm/package/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}/dependencies/`);
    return value;
  }

  async getCommunityPackages(community: string): Promise<unknown[]> {
    return this.getAllPages<unknown>(`/c/${encodeURIComponent(community)}/api/v1/package/`);
  }

  resolveDownloadUrl(value: string): URL {
    return validateRemoteUrl(value, this.allowedDownloadHosts);
  }

  private url(path: string): URL {
    let url: URL;
    try {
      url = new URL(path, this.baseUrl);
    } catch {
      throw new UnsafeInputError("Invalid API path");
    }
    if (url.origin !== this.baseUrl.origin) throw new UnsafeInputError("API request attempted to leave the configured host");
    return url;
  }

  private decodePage<T>(value: unknown, validatePage?: (value: unknown) => value is Paged<T>): Paged<T> {
    if (Array.isArray(value)) return { results: value as T[] };
    if (validatePage !== undefined && !validatePage(value)) throw new ThunderstoreApiError("API_SCHEMA_CHANGED", "Unexpected paginated API response");
    if (typeof value !== "object" || value === null || !Array.isArray((value as { results?: unknown }).results)) {
      throw new ThunderstoreApiError("API_SCHEMA_CHANGED", "Unexpected paginated API response");
    }
    const page = value as { results: T[]; next?: unknown; count?: unknown };
    if (page.next !== undefined && page.next !== null && typeof page.next !== "string") {
      throw new ThunderstoreApiError("API_SCHEMA_CHANGED", "Invalid pagination link");
    }
    return { results: page.results, next: page.next ?? undefined, count: typeof page.count === "number" ? page.count : undefined };
  }
}
