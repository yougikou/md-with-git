import type { DocumentNode, TreeNode } from './types';

export interface DocumentSearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

export interface SearchIndexEntry {
  path: string;
  title: string;
  text: string;
}

export function flattenDocuments(nodes: TreeNode[]): DocumentNode[] {
  return nodes.flatMap((node) => node.kind === 'document' ? [node] : flattenDocuments(node.children));
}

export function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function plainText(markdown: string): string {
  return markdown
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?(?:\[([^\]]*)\]\([^)]*\))/g, '$1')
    .replace(/[`*_>#~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function snippetFor(content: string, terms: string[]): string {
  const lowered = normalized(content);
  const positions = terms.map((term) => lowered.indexOf(term)).filter((position) => position >= 0);
  const position = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, position - 90);
  const end = Math.min(content.length, position + 240);
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
}

export function createSearchIndexEntry(document: Pick<DocumentNode, 'path' | 'title'>, markdown: string): SearchIndexEntry {
  return { path: document.path, title: document.title, text: plainText(markdown) };
}

export function searchIndexEntry(entry: SearchIndexEntry, query: string): DocumentSearchResult | null {
  const terms = normalized(query).split(' ').filter(Boolean);
  if (!terms.length) return null;
  const title = normalized(entry.title);
  const path = normalized(entry.path);
  const content = normalized(entry.text);
  const searchable = `${title} ${path} ${content}`;
  if (!terms.every((term) => searchable.includes(term))) return null;

  const titleHits = terms.filter((term) => title.includes(term)).length;
  const pathHits = terms.filter((term) => path.includes(term)).length;
  const contentHits = terms.filter((term) => content.includes(term)).length;
  return {
    path: entry.path,
    title: entry.title,
    snippet: entry.text ? snippetFor(entry.text, terms) : entry.path,
    score: titleHits * 100 + pathHits * 20 + contentHits,
  };
}
