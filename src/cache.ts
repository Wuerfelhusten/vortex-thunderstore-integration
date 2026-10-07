interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  storedAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly now: () => number = Date.now) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.now()) return undefined;
    return entry.value;
  }

  getStale(key: string): T | undefined {
    return this.entries.get(key)?.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new Error("Cache TTL must be a non-negative finite number");
    const storedAt = this.now();
    this.entries.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}
