export type DocumentViewMode = 'document' | 'history' | 'diff';

export function parseDocumentRoute(path: string): { documentPath: string; viewMode: DocumentViewMode } {
  if (path.endsWith('/history')) return { documentPath: path.slice(0, -'/history'.length), viewMode: 'history' };
  if (path.endsWith('/diff')) return { documentPath: path.slice(0, -'/diff'.length), viewMode: 'diff' };
  return { documentPath: path, viewMode: 'document' };
}

export function encodeDocumentUrl(owner: string, repository: string, path: string): string {
  return `/docs/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function buildVersionUrl(documentHref: string, sha: string): string {
  const [path, query = ''] = documentHref.split('?');
  const params = new URLSearchParams(query);
  params.set('ref', sha);
  params.set('historyVersion', '1');
  return `${path}?${params.toString()}`;
}

export function buildComparisonUrl(diffHref: string, from: string, to: string): string {
  const separator = diffHref.includes('?') ? '&' : '?';
  return `${diffHref}${separator}from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}
