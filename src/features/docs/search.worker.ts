/// <reference lib="webworker" />

import { createSearchIndexEntry, searchIndexEntry } from './search';
import type { DocumentSearchResult, SearchIndexEntry } from './search';

type SearchWorkerInput =
  | { type: 'reset' }
  | { type: 'add'; document: { path: string; title: string }; content: string }
  | { type: 'load'; serialized: string }
  | { type: 'finish'; cacheable: boolean; degradedCount: number }
  | { type: 'query'; id: number; query: string; limit: number };

type SearchWorkerOutput =
  | { type: 'ready'; serialized?: string; degradedCount: number }
  | { type: 'results'; id: number; results: DocumentSearchResult[] };

let index: SearchIndexEntry[] = [];

self.onmessage = (event: MessageEvent<SearchWorkerInput>) => {
  const message = event.data;
  if (message.type === 'reset') {
    index = [];
    return;
  }
  if (message.type === 'add') {
    index.push(createSearchIndexEntry(message.document, message.content));
    return;
  }
  if (message.type === 'load') {
    try {
      const cached = JSON.parse(message.serialized) as { schema?: number; entries?: SearchIndexEntry[]; degradedCount?: number };
      index = cached.schema === 1 && Array.isArray(cached.entries) ? cached.entries : [];
      self.postMessage({ type: 'ready', degradedCount: cached.degradedCount || 0 } satisfies SearchWorkerOutput);
    } catch {
      index = [];
      self.postMessage({ type: 'ready', degradedCount: 0 } satisfies SearchWorkerOutput);
    }
    return;
  }
  if (message.type === 'finish') {
    const serialized = message.cacheable ? JSON.stringify({ schema: 1, entries: index, degradedCount: message.degradedCount }) : undefined;
    self.postMessage({ type: 'ready', serialized, degradedCount: message.degradedCount } satisfies SearchWorkerOutput);
    return;
  }
  const results = index
    .map((entry) => searchIndexEntry(entry, message.query))
    .filter((result): result is DocumentSearchResult => result !== null)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, 'zh-CN'))
    .slice(0, message.limit);
  self.postMessage({ type: 'results', id: message.id, results } satisfies SearchWorkerOutput);
};

export {};
