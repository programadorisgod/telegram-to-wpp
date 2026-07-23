interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface TTLCacheOptions {
  ttlMs: number;
  maxSize: number;
  cleanupIntervalMs?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

/**
 * Generic TTL-based LRU cache.
 *
 * - Entries expire after `ttlMs` milliseconds.
 * - When `maxSize` is exceeded, the oldest entries are evicted.
 * - Optional periodic cleanup via `cleanupIntervalMs`.
 */
export class TTLCache<K, V> {
  private store = new Map<K, CacheEntry<V>>();
  private hits = 0;
  private misses = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  readonly ttlMs: number;
  readonly maxSize: number;

  constructor(options: TTLCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxSize = options.maxSize;

    if (options.cleanupIntervalMs) {
      this.cleanupTimer = setInterval(() => this.cleanup(), options.cleanupIntervalMs);
      // Allow Node.js to exit even if the timer is active
      this.cleanupTimer.unref();
    }
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: K, value: V): void {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Remove all expired entries. Returns the number of entries removed.
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Return cache statistics for monitoring.
   */
  get stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.store.size,
      maxSize: this.maxSize,
    };
  }

  /** Clear all entries and stop periodic cleanup. */
  destroy(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
