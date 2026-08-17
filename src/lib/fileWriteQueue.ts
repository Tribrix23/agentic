/**
 * Serializes mutating operations by canonical target path.
 * Operations for different paths are still allowed to run concurrently.
 */
const tails = new Map<string, Promise<void>>();

export function normalizeFilePath(path: string): string {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase();
}

export async function withFileWriteLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const key = normalizeFilePath(path);
  if (!key) return operation();

  const previous = tails.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  tails.set(key, current);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (tails.get(key) === current) tails.delete(key);
  }
}

export function clearFileWriteQueues(): void {
  tails.clear();
}