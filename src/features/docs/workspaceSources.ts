export type WorkspaceSourceKind = 'github' | 'bitbucket' | 'local-folder' | 'local-git';

export interface WorkspaceSource {
  id: string;
  label: string;
  kind: WorkspaceSourceKind;
  owner: string;
  repository: string;
  scope?: string;
  ref?: string;
  localId?: string;
  lastHref?: string;
  expandedPaths?: string[];
}

export type WorkspaceSourceInput = Omit<WorkspaceSource, 'id' | 'lastHref' | 'expandedPaths'>;

const storageKey = 'git-md-viewer-workspace-sources';

function sourceKey(source: WorkspaceSourceInput | WorkspaceSource): string {
  return [source.kind, source.owner, source.repository, source.scope || '', source.ref || '', source.localId || ''].join(':');
}

function writeWorkspaceSources(sources: WorkspaceSource[]): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(storageKey, JSON.stringify(sources)); } catch { /* 工作区仍可在当前页面继续使用。 */ }
}

export function loadWorkspaceSources(): WorkspaceSource[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WorkspaceSource => Boolean(item && typeof item === 'object' && typeof (item as WorkspaceSource).id === 'string' && typeof (item as WorkspaceSource).label === 'string'));
  } catch {
    return [];
  }
}

export function saveWorkspaceSource(input: WorkspaceSourceInput): WorkspaceSource {
  const sources = loadWorkspaceSources();
  const existing = sources.find((source) => sourceKey(source) === sourceKey(input));
  if (existing) {
    const next = { ...existing, ...input };
    writeWorkspaceSources(sources.map((source) => source.id === existing.id ? next : source));
    return next;
  }
  const source: WorkspaceSource = { ...input, id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  writeWorkspaceSources([...sources, source]);
  return source;
}

export function updateWorkspaceSource(id: string, patch: Partial<Pick<WorkspaceSource, 'label' | 'lastHref' | 'expandedPaths'>>): WorkspaceSource[] {
  const next = loadWorkspaceSources().map((source) => source.id === id ? { ...source, ...patch } : source);
  writeWorkspaceSources(next);
  return next;
}

export function removeWorkspaceSource(id: string): WorkspaceSource[] {
  const next = loadWorkspaceSources().filter((source) => source.id !== id);
  writeWorkspaceSources(next);
  return next;
}

export function moveWorkspaceSource(id: string, offset: -1 | 1): WorkspaceSource[] {
  const next = loadWorkspaceSources();
  const index = next.findIndex((source) => source.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  writeWorkspaceSources(next);
  return next;
}

export function workspaceSourceHref(source: WorkspaceSource): string {
  if (source.lastHref) return source.lastHref;
  const query = new URLSearchParams({ sourceId: source.id });
  if (source.kind === 'local-folder' || source.kind === 'local-git') {
    query.set('source', 'local');
    query.set('localMode', source.kind === 'local-git' ? 'git' : 'folder');
    if (source.localId) query.set('localId', source.localId);
    if (source.scope) query.set('scope', source.scope);
    return `/docs/local/${source.kind === 'local-git' ? 'git' : 'folder'}?${query.toString()}`;
  }
  query.set('source', source.kind);
  if (source.scope) query.set('scope', source.scope);
  if (source.ref) query.set('ref', source.ref);
  const path = source.scope ? `/${source.scope.split('/').map(encodeURIComponent).join('/')}` : '';
  return `/docs/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}${path}?${query.toString()}`;
}
