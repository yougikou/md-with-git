import type { FileQuery } from './types';

interface CacheEntry {
  value: string;
  storedAt: number;
  accessedAt: number;
  bytes: number;
}

interface CachePolicy {
  maxAgeMs: number;
  maxEntries: number;
  maxBytes: number;
}

const memoryCache = new Map<string, CacheEntry>();
const databaseName = 'git-md-viewer';
const storeName = 'markdown';
const searchStoreName = 'search-index';
const encoder = new TextEncoder();
const markdownPolicy: CachePolicy = { maxAgeMs: 14 * 24 * 60 * 60 * 1000, maxEntries: 250, maxBytes: 24 * 1024 * 1024 };
const searchPolicy: CachePolicy = { maxAgeMs: 7 * 24 * 60 * 60 * 1000, maxEntries: 24, maxBytes: 16 * 1024 * 1024 };

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(databaseName, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
      if (!request.result.objectStoreNames.contains(searchStoreName)) request.result.createObjectStore(searchStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function isCacheEntry(value: unknown): value is CacheEntry {
  return Boolean(value && typeof value === 'object' && typeof (value as CacheEntry).value === 'string' && typeof (value as CacheEntry).storedAt === 'number' && typeof (value as CacheEntry).accessedAt === 'number' && typeof (value as CacheEntry).bytes === 'number');
}

function isExpired(entry: CacheEntry, policy: CachePolicy): boolean {
  return Date.now() - entry.storedAt > policy.maxAgeMs;
}

async function deleteEntry(store: string, key: string): Promise<void> {
  memoryCache.delete(key);
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction(store, 'readwrite').objectStore(store).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function touchEntry(store: string, key: string, entry: CacheEntry, keepInMemory: boolean): Promise<void> {
  const next = { ...entry, accessedAt: Date.now() };
  if (keepInMemory) memoryCache.set(key, next);
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction(store, 'readwrite').objectStore(store).put(next, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function pruneStore(store: string, policy: CachePolicy): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const objectStore = database.transaction(store, 'readwrite').objectStore(store);
    const valuesRequest = objectStore.getAll();
    const keysRequest = objectStore.getAllKeys();
    let values: unknown[] | undefined;
    let keys: IDBValidKey[] | undefined;
    const finish = () => {
      if (!values || !keys) return;
      const valid: Array<{ key: string; entry: CacheEntry }> = [];
      values.forEach((value, index) => {
        const key = String(keys![index]);
        if (!isCacheEntry(value) || isExpired(value, policy)) {
          objectStore.delete(keys![index]);
          memoryCache.delete(key);
          return;
        }
        valid.push({ key, entry: value });
      });
      valid.sort((left, right) => left.entry.accessedAt - right.entry.accessedAt);
      let totalBytes = valid.reduce((total, item) => total + item.entry.bytes, 0);
      while (valid.length > policy.maxEntries || totalBytes > policy.maxBytes) {
        const oldest = valid.shift();
        if (!oldest) break;
        totalBytes -= oldest.entry.bytes;
        objectStore.delete(oldest.key);
        memoryCache.delete(oldest.key);
      }
      resolve();
    };
    valuesRequest.onsuccess = () => { values = valuesRequest.result; finish(); };
    valuesRequest.onerror = () => resolve();
    keysRequest.onsuccess = () => { keys = keysRequest.result; finish(); };
    keysRequest.onerror = () => resolve();
  });
}

async function readCache(store: string, key: string, policy: CachePolicy, keepInMemory: boolean): Promise<string | null> {
  const memoryValue = keepInMemory ? memoryCache.get(key) : undefined;
  if (memoryValue) {
    if (isExpired(memoryValue, policy)) { void deleteEntry(store, key); return null; }
    void touchEntry(store, key, memoryValue, keepInMemory);
    return memoryValue.value;
  }
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction(store, 'readonly').objectStore(store).get(key);
    request.onsuccess = () => {
      if (!isCacheEntry(request.result)) { resolve(null); return; }
      if (isExpired(request.result, policy)) { void deleteEntry(store, key); resolve(null); return; }
      if (keepInMemory) memoryCache.set(key, request.result);
      void touchEntry(store, key, request.result, keepInMemory);
      resolve(request.result.value);
    };
    request.onerror = () => resolve(null);
  });
}

async function writeCache(store: string, key: string, value: string, policy: CachePolicy, keepInMemory: boolean): Promise<void> {
  const now = Date.now();
  const entry: CacheEntry = { value, storedAt: now, accessedAt: now, bytes: encoder.encode(value).byteLength };
  if (keepInMemory) memoryCache.set(key, entry);
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction(store, 'readwrite').objectStore(store).put(entry, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
  await pruneStore(store, policy);
}

export function documentCacheKey(kind: string, input: FileQuery): string {
  return [kind, input.owner, input.repository, input.ref || 'default', input.path].join(':');
}

export function readMarkdownCache(key: string): Promise<string | null> {
  return readCache(storeName, key, markdownPolicy, true);
}

export function writeMarkdownCache(key: string, content: string): Promise<void> {
  return writeCache(storeName, key, content, markdownPolicy, true);
}

export function searchIndexCacheKey(kind: string, owner: string, repository: string, version: string, scope = ''): string {
  return [kind, owner, repository, version, scope].join(':');
}

export function readSearchIndexCache(key: string): Promise<string | null> {
  return readCache(searchStoreName, key, searchPolicy, false);
}

export function writeSearchIndexCache(key: string, value: string): Promise<void> {
  return writeCache(searchStoreName, key, value, searchPolicy, false);
}
