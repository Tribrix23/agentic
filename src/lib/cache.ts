// ============================================================================
// Caching Layer for Tool Results
// ============================================================================

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  hits: number;
  metadata?: Record<string, any>;
  valueType?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private defaultTTL: number;
  private stats: { hits: number; misses: number };

  constructor(options?: { maxSize?: number; defaultTTL?: number }) {
    this.cache = new Map();
    this.maxSize = options?.maxSize ?? 1000;
    this.defaultTTL = options?.defaultTTL ?? 5 * 60 * 1000; // 5 minutes default
    this.stats = { hits: 0, misses: 0 };

    // Load from localStorage if available
    this.loadFromStorage();
  }

  private generateKey(toolName: string, args: Record<string, any>): string {
    const sortedArgs = Object.keys(args)
      .sort()
      .reduce((acc, key) => ({ ...acc, [key]: args[key] }), {});
    return `${toolName}:${JSON.stringify(sortedArgs)}`;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private evictExpired(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }

  private evictLRU(): void {
    if (this.cache.size >= this.maxSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  public set(toolName: string, args: Record<string, any>, value: T, ttl?: number): void {
    const key = this.generateKey(toolName, args);
    this.evictExpired();
    this.evictLRU();

    // Determine value type for proper serialization
    let valueType: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
    if (value === null) {
      valueType = 'null';
    } else if (typeof value === 'string') {
      valueType = 'string';
    } else if (typeof value === 'number') {
      valueType = 'number';
    } else if (typeof value === 'boolean') {
      valueType = 'boolean';
    } else if (Array.isArray(value)) {
      valueType = 'array';
    } else {
      valueType = 'object';
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
      hits: 0,
      valueType,
    };

    this.cache.set(key, entry);
    this.saveToStorage();
  }

  public get(toolName: string, args: Record<string, any>): T | null {
    const key = this.generateKey(toolName, args);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.value;
  }

  public has(toolName: string, args: Record<string, any>): boolean {
    const key = this.generateKey(toolName, args);
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  public invalidate(toolName?: string): void {
    if (toolName) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(toolName + ':')) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
    this.saveToStorage();
  }

  public getStats(): CacheStats {
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  public resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  private saveToStorage(): void {
    try {
      const serialized = Array.from(this.cache.entries()).map(([key, entry]) => [
        key,
        {
          ...entry,
          value: entry.valueType === 'object' || entry.valueType === 'array' 
            ? JSON.stringify(entry.value) 
            : entry.value,
        },
      ]);
      localStorage.setItem('quantix_cache', JSON.stringify(serialized));
    } catch (e) {
      // Ignore storage errors (might be quota exceeded)
    }
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('quantix_cache');
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const [key, entry] of parsed) {
          if (!this.isExpired(entry)) {
            // Restore value based on stored type
            let value = entry.value;
            if (entry.valueType === 'object' || entry.valueType === 'array') {
              try {
                value = JSON.parse(value);
              } catch {
                // If parsing fails, keep as string
              }
            }
            this.cache.set(key, { ...entry, value });
          }
        }
      }
    } catch (e) {
      // Ignore corrupted cache
    }
  }

  public clear(): void {
    this.cache.clear();
    localStorage.removeItem('quantix_cache');
  }
}

// Global cache instance for tool results
export const toolCache = new Cache<any>({
  maxSize: 500,
  defaultTTL: 10 * 60 * 1000, // 10 minutes for tool results
});

// Cache for file contents (longer TTL)
export const fileCache = new Cache<string>({
  maxSize: 200,
  defaultTTL: 30 * 60 * 1000, // 30 minutes for file contents
});

// Cache for API responses (shorter TTL)
export const apiCache = new Cache<any>({
  maxSize: 100,
  defaultTTL: 2 * 60 * 1000, // 2 minutes for API responses
});
