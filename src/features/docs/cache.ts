import type { FileQuery } from './types';

const memoryCache = new Map<string, string>();
const databaseName = 'git-md-viewer';
const storeName = 'markdown';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export function documentCacheKey(kind: string, input: FileQuery): string {
  return [kind, input.owner, input.repository, input.ref || 'default', input.path].join(':');
}

export async function readMarkdownCache(key: string): Promise<string | null> {
  const memoryValue = memoryCache.get(key);
  if (memoryValue !== undefined) return memoryValue;
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => {
      const value = typeof request.result === 'string' ? request.result : null;
      if (value !== null) memoryCache.set(key, value);
      resolve(value);
    };
    request.onerror = () => resolve(null);
  });
}

export async function writeMarkdownCache(key: string, content: string): Promise<void> {
  memoryCache.set(key, content);
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(content, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}
