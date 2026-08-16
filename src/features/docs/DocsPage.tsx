import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import tocbot from 'tocbot';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { buildDocumentTree, findDocument, findFirstDocument } from './tree';
import { parseFrontmatter } from './markdown';
import { useResolvedAssetUrl } from './assetUrls';
import { documentCacheKey, readMarkdownCache, readSearchIndexCache, searchIndexCacheKey, writeMarkdownCache, writeSearchIndexCache } from './cache';
import { BitbucketProvider, getLocalFolder, GitHubProvider, LocalFolderPermissionError } from './providers';
import type { DocumentNode, RepositoryEntry, RepositoryProvider, RepositoryRef, TreeNode } from './types';
import type { ImgHTMLAttributes } from 'react';
import { parse as parseYaml } from 'yaml';
import { useDocsHostConfiguration, useDocsRendererRegistry } from './renderers';
import type { DocsRendererRegistry, YamlBlockContext } from './renderers';
import { HistoryView } from './HistoryView';
import { DiffView } from './DiffView';
import type { Commit, DiffResult } from './types';
import { encodeDocumentUrl, parseDocumentRoute } from './versionRoutes';
import { flattenDocuments } from './search';
import type { DocumentSearchResult } from './search';
import { loadWorkspaceSources, saveWorkspaceSource, updateWorkspaceSource, workspaceSourceHref } from './workspaceSources';
import type { WorkspaceSource } from './workspaceSources';
import { activateRepositoryAccessToken } from './accessTokens';
import { LanguageSwitcher, useI18n } from '../../i18n';
import { BrandMark } from './Branding';
import { ResizableMarkdownTable, resizableMarkdownTableComponents } from './ResizableMarkdownTable';

const githubProvider = new GitHubProvider();
const bitbucketProvider = new BitbucketProvider();
type SourceKind = 'github' | 'bitbucket' | 'local';

interface SearchProfile {
  concurrency: number;
  bodyBudget: number;
  maxBodyDocuments: number;
  maxFileSize: number;
  label: string;
}

function getSearchProfile(): SearchProfile {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;
  if ((memory !== undefined && memory <= 2) || cores <= 2) return { concurrency: 1, bodyBudget: 4 * 1024 * 1024, maxBodyDocuments: 150, maxFileSize: 192 * 1024, label: '低资源模式' };
  if ((memory !== undefined && memory <= 4) || (memory === undefined && cores <= 8) || cores <= 4) return { concurrency: 2, bodyBudget: 12 * 1024 * 1024, maxBodyDocuments: 500, maxFileSize: 512 * 1024, label: '平衡模式' };
  return { concurrency: 4, bodyBudget: 32 * 1024 * 1024, maxBodyDocuments: 1000, maxFileSize: 1024 * 1024, label: '完整模式' };
}

async function waitUntilPageIsVisible(): Promise<void> {
  if (document.visibilityState === 'visible') return;
  await new Promise<void>((resolve) => document.addEventListener('visibilitychange', () => resolve(), { once: true }));
}

async function readCachedDocument(provider: RepositoryProvider, owner: string, repository: string, path: string, ref?: string): Promise<string> {
  const query = { owner, repository, path, ref };
  if (provider.kind === 'local') return provider.getFile(query);
  const cacheKey = documentCacheKey(provider.kind, query);
  const cached = await readMarkdownCache(cacheKey);
  if (cached !== null) return cached;
  const content = await provider.getFile(query);
  await writeMarkdownCache(cacheKey, content);
  return content;
}

function ErrorState({ message, actionHref = '/', actionLabel = '返回首页', onRetry, retrying = false }: { message: string; actionHref?: string; actionLabel?: string; onRetry?: () => void; retrying?: boolean }) {
  const { t } = useI18n();
  return <div className="state-card error-state"><span className="state-icon">!</span><h2>{t('failedToLoad')}</h2><p>{message}</p>{onRetry && <button type="button" className="button button-primary" onClick={onRetry} disabled={retrying}>{retrying ? t('authorizing') : t('reauthorize')}</button>}<Link to={actionHref} className="button button-primary">{actionLabel === '返回首页' ? t('home') : actionLabel}</Link></div>;
}

function SidebarNode({ node, activePath, expandedPaths, onNavigate, onToggle }: { node: TreeNode; activePath: string; expandedPaths: Set<string>; onNavigate: (path: string) => void; onToggle: (path: string) => void }) {
  if (node.kind === 'document') {
    return <button className={`sidebar-link ${activePath === node.path ? 'active' : ''}`} onClick={() => onNavigate(node.path)}><span className="file-icon">{node.isIndex ? '⌂' : '·'}</span>{node.title}</button>;
  }
  const open = expandedPaths.has(node.path);
  return <div className="sidebar-group"><button className="sidebar-section" onClick={() => onToggle(node.path)}><span className={`chevron ${open ? 'open' : ''}`}>›</span><span>{node.title}</span></button>{open && <div className="sidebar-children">{node.children.map((child) => <SidebarNode key={child.path} node={child} activePath={activePath} expandedPaths={expandedPaths} onNavigate={onNavigate} onToggle={onToggle} />)}</div>}</div>;
}

function WorkspaceSwitcher({ sources, activeId, onSelect }: { sources: WorkspaceSource[]; activeId?: string; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const active = sources.find((source) => source.id === activeId);
  const alternatives = sources.filter((source) => source.id !== activeId);
  if (!active || !activeId) return null;
  return <details className="workspace-switcher"><summary><span className="workspace-source-title">{active.label}</span><span className="workspace-switcher-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m7 9 5-5 5 5M7 15l5 5 5-5" /></svg></span></summary>{alternatives.length > 0 && <div className="workspace-switcher-menu" role="menu">{alternatives.map((source) => <button type="button" role="menuitem" key={source.id} onClick={(event) => { const details = event.currentTarget.closest('details'); if (details) details.open = false; onSelect(source.id); }}><span>{source.label}</span><small>{source.kind === 'local-folder' ? t('localFolderName') : source.kind === 'local-git' ? t('localGitLabel') : source.kind === 'bitbucket' ? 'Bitbucket' : 'GitHub'}</small></button>)}</div>}</details>;
}

function Sidebar({ tree, activePath, expandedPaths, onNavigate, onToggle, sources, activeSourceId, onSelectSource, onClose, collapsed, onCollapseToggle, containerRef }: { tree: TreeNode[]; activePath: string; expandedPaths: Set<string>; onNavigate: (path: string) => void; onToggle: (path: string) => void; sources: WorkspaceSource[]; activeSourceId?: string; onSelectSource: (id: string) => void; onClose: () => void; collapsed: boolean; onCollapseToggle: () => void; containerRef: RefObject<HTMLElement> }) {
  const { t } = useI18n();
  return <aside ref={containerRef} id="document-sidebar" className={`docs-sidebar ${collapsed ? 'collapsed' : ''}`} tabIndex={-1} aria-label={t('documentation')}><button type="button" className="sidebar-collapse-toggle" onClick={onCollapseToggle} aria-expanded={!collapsed} aria-label={collapsed ? t('sidebarExpand') : t('sidebarCollapse')} title={collapsed ? t('sidebarExpand') : t('sidebarCollapse')}>{collapsed ? '›' : '‹'}</button><div className="sidebar-content"><button type="button" className="mobile-menu-close" onClick={onClose}>{t('closeDirectory')}</button><WorkspaceSwitcher sources={sources} activeId={activeSourceId} onSelect={onSelectSource} /><div className="sidebar-heading"><span className="sidebar-kicker">{t('documentation')}</span><span className="tree-count">{countDocuments(tree)} {t('pages')}</span></div><nav aria-label={t('documentation')}>{tree.map((node) => <SidebarNode key={node.path} node={node} activePath={activePath} expandedPaths={expandedPaths} onNavigate={onNavigate} onToggle={onToggle} />)}</nav></div></aside>;
}

function collectSectionPaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => node.kind === 'document' ? [] : [node.path, ...collectSectionPaths(node.children)]);
}

function countDocuments(nodes: TreeNode[]): number {
  return nodes.reduce((count, node) => count + (node.kind === 'document' ? 1 : countDocuments(node.children)), 0);
}

function LoadingState({ source }: { source: SourceKind }) {
  const { t } = useI18n();
  const label = source === 'local' ? t('localFolderName') : source === 'bitbucket' ? 'Bitbucket' : 'GitHub';
  return <div className="state-card loading-state"><div className="spinner" /><h2>{t('loadingDocuments')}</h2><p>{t('loadingFrom', { source: label })}</p></div>;
}

function MarkdownImage({ src, alt, provider, owner, repository, documentPath, assetRef, ...props }: ImgHTMLAttributes<HTMLImageElement> & { provider: RepositoryProvider; owner: string; repository: string; documentPath: string; assetRef?: string }) {
  const resolvedSrc = useResolvedAssetUrl({ src, provider, owner, repository, documentPath, assetRef });
  return <img {...props} src={resolvedSrc} alt={alt || ''} />;
}

interface TocEntry {
  id: string;
  level: number;
  line: number;
  title: string;
}

function plainHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[\\`*_~]/g, '')
    .trim();
}

function headingSlug(title: string): string {
  const normalized = title.normalize('NFKD').toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s-]+/g, '-');
  return normalized || 'section';
}

function extractToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const usedIds = new Map<string, number>();
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  let fenced = false;
  const add = (level: number, rawTitle: string, line: number) => {
    const title = plainHeadingText(rawTitle.replace(/\s+#+\s*$/, ''));
    if (!title || level < 2) return;
    const slug = headingSlug(title);
    const count = usedIds.get(slug) || 0;
    usedIds.set(slug, count + 1);
    entries.push({ id: `toc-${slug}${count ? `-${count}` : ''}`, level, line, title });
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const atx = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/);
    if (atx) { add(atx[1].length, atx[2], index + 1); continue; }
    const underline = lines[index + 1];
    if (line.trim() && underline && /^ {0,3}(-{2,}|={2,})\s*$/.test(underline)) {
      add(underline.trim().startsWith('=') ? 1 : 2, line, index + 1);
      index += 1;
    }
  }
  return entries;
}

function nodeStartLine(node: unknown): number | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const position = (node as { position?: { start?: { line?: unknown } } }).position;
  return typeof position?.start?.line === 'number' ? position.start.line : undefined;
}

function tocIdForNode(entriesByLine: Map<number, TocEntry>, node: unknown): string | undefined {
  const line = nodeStartLine(node);
  return line === undefined ? undefined : entriesByLine.get(line)?.id;
}

function DocumentToc({ collapsed, navRef, onToggle, label, collapseLabel, expandLabel }: { collapsed: boolean; navRef: RefObject<HTMLElement>; onToggle: () => void; label: string; collapseLabel: string; expandLabel: string }) {
  return <aside className={`document-table-of-contents ${collapsed ? 'collapsed' : ''}`} aria-label={label}><div className="toc-heading"><span>{label}</span><button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? expandLabel : collapseLabel}>{collapsed ? '‹' : '›'}</button></div>{!collapsed && <nav ref={navRef} />}</aside>;
}

function sourceFromQuery(value: string | null): SourceKind {
  return value === 'bitbucket' || value === 'local' ? value : 'github';
}

function readCodeMeta(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const candidate = node as { data?: { meta?: unknown }; meta?: unknown };
  if (typeof candidate.data?.meta === 'string') return candidate.data.meta;
  return typeof candidate.meta === 'string' ? candidate.meta : '';
}

function rendererNameFromMeta(meta: string): string | undefined {
  return meta.match(/(?:^|\s)renderer=([^\s]+)/)?.[1];
}

function HighlightedSearchText({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean).sort((left, right) => right.length - left.length);
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return <>{parts.map((part, index) => terms.some((term) => term.toLocaleLowerCase() === part.toLocaleLowerCase()) ? <mark key={`${part}-${index}`}>{part}</mark> : part)}</>;
}

function YamlRendererBlock({ name, source, registry, context }: { name: string; source: string; registry: DocsRendererRegistry; context: YamlBlockContext }) {
  let value: unknown;
  try {
    value = parseYaml(source, { schema: 'core' });
  } catch (reason: unknown) {
    const message = reason instanceof Error ? reason.message : 'YAML 解析失败。';
    return <div className="yaml-renderer-fallback"><p className="yaml-renderer-diagnostic">无法解析 renderer={name}：{message}</p><code>{source}</code></div>;
  }
  const Renderer = registry.getYamlRenderer(name);
  if (!Renderer) return <div className="yaml-renderer-fallback"><p className="yaml-renderer-diagnostic">未注册 YAML 渲染器 “{name}”，已降级为原始数据。</p><code>{source}</code></div>;
  return <div className="yaml-rendered-block"><Renderer value={value} context={context} /></div>;
}

export default function DocsPage() {
  const { t } = useI18n();
  const { '*': wildcard = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [source, setSource] = useState<{ path: string; content: string } | null>(null);
  const [refs, setRefs] = useState<RepositoryRef[]>([]);
  const [defaultRef, setDefaultRef] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPermissionRequired, setLocalPermissionRequired] = useState(false);
  const [localPermissionRequesting, setLocalPermissionRequesting] = useState(false);
  const [localPermissionNonce, setLocalPermissionNonce] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [history, setHistory] = useState<Commit[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [comparisonBefore, setComparisonBefore] = useState<string | null>(null);
  const [comparisonAfter, setComparisonAfter] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [indexedCount, setIndexedCount] = useState(0);
  const [indexTotal, setIndexTotal] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [workspaceSources, setWorkspaceSources] = useState<WorkspaceSource[]>(loadWorkspaceSources);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const searchWorker = useRef<Worker | null>(null);
  const searchRequestId = useRef(0);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const tocNavRef = useRef<HTMLElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const rendererRegistry = useDocsRendererRegistry();

  const segments = wildcard.split('/').filter(Boolean);
  const owner = segments[0] || '';
  const repository = segments[1] || '';
  const routedPath = segments.slice(2).join('/');
  const { documentPath: requestedPath, viewMode } = parseDocumentRoute(routedPath);
  const ref = searchParams.get('ref') || undefined;
  const scope = searchParams.get('scope')?.replace(/^\/+|\/+$/g, '') || undefined;
  const sourceKind = sourceFromQuery(searchParams.get('source'));
  const localMode = sourceKind === 'local' && searchParams.get('localMode') === 'git' ? 'git' : 'folder';
  const localId = searchParams.get('localId');
  const activeSourceId = searchParams.get('sourceId') || undefined;
  const localProvider = useMemo(() => sourceKind === 'local' ? getLocalFolder(localId, localMode) : undefined, [localId, localMode, sourceKind]);
  const provider = useMemo<RepositoryProvider | undefined>(() => {
    if (sourceKind === 'local') return localProvider;
    return sourceKind === 'bitbucket' ? bitbucketProvider : githubProvider;
  }, [localProvider, sourceKind]);
  const tocEntries = useMemo(() => source ? extractToc(parseFrontmatter(source.content).content) : [], [source]);
  useEffect(() => {
    if (sourceKind === 'github' || sourceKind === 'bitbucket') activateRepositoryAccessToken(sourceKind, owner, repository);
  }, [owner, repository, sourceKind]);
  const documentPath = scope && requestedPath === scope ? '' : requestedPath;
  const activeRef = ref || defaultRef;
  const currentVersion = refs.find((item) => item.name === activeRef)?.sha || activeRef;
  const activePath = source?.path || documentPath;
  const requestLocalReadPermission = useCallback(async () => {
    if (!localProvider) return;
    setLocalPermissionRequesting(true);
    try {
      await localProvider.requestReadPermission();
      setLocalPermissionRequired(false); setError(null); setContentError(null); setLocalPermissionNonce((value) => value + 1);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '无法重新获得本地文件夹访问权限，请重新选择文件夹。';
      setLocalPermissionRequired(true); setError(message); setContentError(message);
    } finally {
      setLocalPermissionRequesting(false);
    }
  }, [localProvider]);

  useEffect(() => {
    if (activeSourceId || !owner || !repository || (sourceKind === 'local' && !localId)) return;
    const kind = sourceKind === 'local' ? localMode === 'git' ? 'local-git' : 'local-folder' : sourceKind;
    const saved = saveWorkspaceSource({ label: sourceKind === 'local' ? `${repository === 'git' ? '本地 Git' : '本地文档'}${scope ? ` · ${scope}` : ''}` : `${owner}/${repository}${scope ? ` · ${scope}` : ''}`, kind, owner, repository, scope, ref, localId: localId || undefined });
    setWorkspaceSources(loadWorkspaceSources());
    const nextQuery = new URLSearchParams(searchParams);
    nextQuery.set('sourceId', saved.id);
    navigate(`${location.pathname}?${nextQuery.toString()}`, { replace: true });
  }, [activeSourceId, localId, localMode, location.pathname, navigate, owner, ref, repository, scope, searchParams, sourceKind]);

  useEffect(() => {
    if (!activeSourceId) return;
    updateWorkspaceSource(activeSourceId, { lastHref: `${location.pathname}${location.search}` });
  }, [activeSourceId, location.pathname, location.search]);

  useEffect(() => {
    if (!owner || !repository) { setLoading(false); setError('请使用 /docs/:owner/:repository 打开一个文档空间。'); return; }
    if (!provider) { setLoading(false); setError(localMode === 'git' ? '当前本地 Git 仓库访问会话已结束，请重新设置本地 Git 仓库。' : '当前本地文档访问会话已结束，请使用顶栏“本地文档”重新选择文件夹。'); return; }
    if (sourceKind !== 'local' && !scope) { setLoading(false); setError('请指定要渲染的文档目录，例如 ?scope=docs 或 ?scope=docs/guide。'); return; }
    if (sourceKind === 'local' && localMode === 'git' && !scope) { setLoading(false); setError('本地 Git 仓库必须指定文档目录 scope，例如 ?scope=docs。'); return; }
    let cancelled = false;
    setLoading(true); setError(null); setLocalPermissionRequired(false); setSource(null);
    const loadTree = async () => {
      if (localMode === 'git' && localProvider && !(await localProvider.isGitRepository())) throw new Error('未检测到所选项目根目录中的 .git/HEAD，请重新选择 Git 项目文件夹。');
      return provider.getRefs({ owner, repository, ref, rootPath: scope }).then(async (nextRefs) => {
      const nextDefault = nextRefs.find((item) => item.isDefault)?.name || nextRefs[0]?.name;
      const nextRef = ref || nextDefault;
      const nextEntries = await provider.getTree({ owner, repository, ref: nextRef, rootPath: scope });
      if (cancelled) return;
      setRefs(nextRefs); setDefaultRef(nextDefault); setTree(buildDocumentTree(nextEntries, scope || ''));
      });
    };
    loadTree().catch((reason: unknown) => { if (!cancelled) { setLocalPermissionRequired(reason instanceof LocalFolderPermissionError); setError(reason instanceof Error ? reason.message : '无法读取文档空间。'); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [localMode, localPermissionNonce, localProvider, owner, provider, ref, repository, scope, sourceKind]);

  const selectedDocument = useMemo(() => documentPath ? findDocument(tree, documentPath) : findFirstDocument(tree), [documentPath, tree]);

  const openDocument = useCallback((path: string) => {
    const query = new URLSearchParams(searchParams);
    const queryString = query.toString();
    navigate(`/docs/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${path.split('/').map(encodeURIComponent).join('/')}${queryString ? `?${queryString}` : ''}`);
    setSidebarOpen(false);
  }, [navigate, owner, repository, searchParams]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus());
  }, []);

  useEffect(() => {
    document.querySelector<HTMLButtonElement>('.mobile-menu')?.setAttribute('aria-expanded', String(sidebarOpen));
    if (!sidebarOpen) return;
    window.requestAnimationFrame(() => sidebarRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSidebar();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeSidebar, sidebarOpen]);

  useEffect(() => {
    if (!tree.length) return;
    const active = loadWorkspaceSources().find((item) => item.id === activeSourceId);
    setExpandedPaths(new Set(active?.expandedPaths ?? collectSectionPaths(tree)));
  }, [activeSourceId, tree]);

  const toggleSection = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path); else next.add(path);
      if (activeSourceId) updateWorkspaceSource(activeSourceId, { expandedPaths: [...next] });
      return next;
    });
  }, [activeSourceId]);

  const selectWorkspaceSource = useCallback((id: string) => {
    const next = loadWorkspaceSources().find((item) => item.id === id);
    if (next) navigate(workspaceSourceHref(next));
  }, [navigate]);


  useEffect(() => {
    if (!selectedDocument || !provider) return;
    if (viewMode !== 'document') { setContentLoading(false); setContentError(null); setSource(null); return; }
    let cancelled = false;
    setContentLoading(true); setSource(null); setContentError(null);
    const readContent = readCachedDocument(provider, owner, repository, selectedDocument.path, currentVersion || activeRef);
    readContent.then((content) => { if (!cancelled) setSource({ path: selectedDocument.path, content }); }).catch((reason: unknown) => { if (!cancelled) { setLocalPermissionRequired(reason instanceof LocalFolderPermissionError); setContentError(reason instanceof Error ? reason.message : '无法读取 Markdown 文件。'); } }).finally(() => { if (!cancelled) setContentLoading(false); });
    return () => { cancelled = true; };
  }, [activeRef, currentVersion, localId, localPermissionNonce, owner, provider, repository, selectedDocument, sourceKind, viewMode]);

  useEffect(() => { setTocCollapsed(false); }, [source?.path]);

  useEffect(() => {
    if (!provider || !tree.length) return;
    let cancelled = false;
    const documents = flattenDocuments(tree);
    const profile = getSearchProfile();
    const indexWorker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    searchWorker.current?.terminate();
    searchWorker.current = indexWorker;
    let cursor = 0;
    let completed = 0;
    let failed = 0;
    let skipped = 0;
    let bodyBytes = 0;
    let bodyDocuments = 0;
    const version = currentVersion || activeRef || 'default';
    const profileKey = `${version}@${profile.bodyBudget}-${profile.maxBodyDocuments}-${profile.maxFileSize}`;
    const cacheKey = provider.kind === 'local' ? null : searchIndexCacheKey(provider.kind, owner, repository, profileKey, scope || '');
    setSearchQuery(''); setSearchResults([]); setSearchError(null); setSearchNotice(null);
    setIndexedCount(0); setIndexTotal(documents.length); setIndexing(true);

    indexWorker.onmessage = (event: MessageEvent<{ type: 'ready'; serialized?: string; degradedCount: number } | { type: 'results'; id: number; results: DocumentSearchResult[] }>) => {
      if (cancelled) return;
      const message = event.data;
      if (message.type === 'results') {
        if (message.id === searchRequestId.current) setSearchResults(message.results);
        return;
      }
      setIndexing(false);
      setIndexedCount(documents.length);
      if (message.degradedCount > 0) setSearchNotice(`${profile.label}：${message.degradedCount} 个文档仅索引标题和路径。`);
      if (cacheKey && message.serialized) void writeSearchIndexCache(cacheKey, message.serialized);
    };

    const indexingWorker = async () => {
      while (!cancelled) {
        const index = cursor++;
        const documentNode = documents[index];
        if (!documentNode) return;
        try {
          if ((documentNode.size !== undefined && documentNode.size > profile.maxFileSize) || bodyBytes >= profile.bodyBudget || bodyDocuments >= profile.maxBodyDocuments) {
            skipped += 1;
            indexWorker.postMessage({ type: 'add', document: { path: documentNode.path, title: documentNode.title }, content: '' });
          } else {
            await waitUntilPageIsVisible();
            if (cancelled) return;
            const content = await readCachedDocument(provider, owner, repository, documentNode.path, currentVersion || activeRef);
            if (cancelled) return;
            const size = new TextEncoder().encode(content).byteLength;
            if (size > profile.maxFileSize || bodyBytes + size > profile.bodyBudget || bodyDocuments >= profile.maxBodyDocuments) {
              skipped += 1;
              indexWorker.postMessage({ type: 'add', document: { path: documentNode.path, title: documentNode.title }, content: '' });
            } else {
              bodyBytes += size;
              bodyDocuments += 1;
              indexWorker.postMessage({ type: 'add', document: { path: documentNode.path, title: documentNode.title }, content });
            }
          }
        } catch {
          failed += 1;
          if (!cancelled) indexWorker.postMessage({ type: 'add', document: { path: documentNode.path, title: documentNode.title }, content: '' });
        } finally {
          completed += 1;
          if (!cancelled) setIndexedCount(completed);
        }
      }
    };
    const buildIndex = async () => {
      if (cacheKey) {
        const cached = await readSearchIndexCache(cacheKey);
        if (cancelled) return;
        if (cached) {
          indexWorker.postMessage({ type: 'load', serialized: cached });
          return;
        }
      }
      await Promise.all(Array.from({ length: Math.min(profile.concurrency, documents.length) }, indexingWorker));
      if (cancelled) return;
      setSearchError(failed ? `${failed} 个文档读取失败，其余文档仍可搜索。` : null);
      indexWorker.postMessage({ type: 'finish', cacheable: provider.kind !== 'local', degradedCount: failed + skipped });
    };
    void buildIndex();
    return () => { cancelled = true; indexWorker.terminate(); if (searchWorker.current === indexWorker) searchWorker.current = null; };
  }, [activeRef, currentVersion, owner, provider, repository, scope, tree]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || indexing || !searchWorker.current) { setSearchResults([]); return; }
    const id = ++searchRequestId.current;
    const timer = window.setTimeout(() => searchWorker.current?.postMessage({ type: 'query', id, query, limit: 30 }), 80);
    return () => window.clearTimeout(timer);
  }, [indexing, searchQuery]);

  const fromRef = searchParams.get('from') || undefined;
  const toRef = searchParams.get('to') || undefined;

  useEffect(() => {
    if (viewMode !== 'history' || !selectedDocument || !provider) return;
    let cancelled = false;
    setHistoryLoading(true); setHistoryError(null); setHistory([]);
    provider.getFileHistory({ owner, repository, path: selectedDocument.path, ref: activeRef, limit: 20 }).then((commits) => { if (!cancelled) setHistory(commits); }).catch((reason: unknown) => { if (!cancelled) setHistoryError(reason instanceof Error ? reason.message : '无法读取文件历史。'); }).finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [activeRef, owner, provider, repository, selectedDocument, viewMode]);

  useEffect(() => {
    if (viewMode !== 'diff' || !selectedDocument || !provider || !fromRef || !toRef) return;
    let cancelled = false;
    setDiffLoading(true); setDiffError(null); setDiff(null); setComparisonBefore(null); setComparisonAfter(null);
    const readVersion = (ref: string) => provider.getFile({ owner, repository, path: selectedDocument.path, ref }).catch(() => '');
    Promise.all([provider.compare({ owner, repository, path: selectedDocument.path, ref: activeRef, from: fromRef, to: toRef }), readVersion(fromRef), readVersion(toRef)]).then(([result, before, after]) => { if (!cancelled) { setDiff(result); setComparisonBefore(before); setComparisonAfter(after); } }).catch((reason: unknown) => { if (!cancelled) setDiffError(reason instanceof Error ? reason.message : '无法比较文档版本。'); }).finally(() => { if (!cancelled) setDiffLoading(false); });
    return () => { cancelled = true; };
  }, [activeRef, fromRef, owner, provider, repository, selectedDocument, toRef, viewMode]);

  useEffect(() => {
    if (viewMode !== 'document' || tocCollapsed || !tocEntries.length || !tocNavRef.current || !articleRef.current) return;
    tocbot.init({
      tocElement: tocNavRef.current,
      contentElement: articleRef.current,
      headingSelector: 'h2, h3, h4, h5, h6',
      orderedList: false,
      scrollSmooth: false,
      headingsOffset: 88,
      scrollHandlerType: 'throttle',
      scrollHandlerTimeout: 50,
      // Tocbot still generates and maintains the navigation tree, but its
      // viewport-based active-heading detection is not reliable in this page's
      // document layout. Keep those implementation classes unstyled instead.
      activeLinkClass: 'toc-active-link-disabled',
      activeListItemClass: 'toc-active-list-item-disabled',
      disableTocScrollSync: true,
    });
    return () => tocbot.destroy();
  }, [tocCollapsed, tocEntries, viewMode]);

  if (loading) return <div className="docs-shell"><Topbar owner={owner} repository={repository} scope={scope} source={sourceKind} localMode={localMode} onMenu={() => setSidebarOpen(true)} /><LoadingState source={sourceKind} /></div>;
  if (error && !tree.length) return <div className="docs-shell"><Topbar owner={owner} repository={repository} scope={scope} source={sourceKind} localMode={localMode} onMenu={() => setSidebarOpen(true)} /><ErrorState message={error} actionHref={sourceKind === 'local' ? `/?mode=${localMode === 'git' ? 'local-git' : 'local-folder'}` : '/'} actionLabel={sourceKind === 'local' ? localMode === 'git' ? '重新设置本地 Git' : '重新设置本地文档' : '返回首页'} onRetry={localPermissionRequired ? requestLocalReadPermission : undefined} retrying={localPermissionRequesting} /></div>;
  if (!tree.length) return <div className="docs-shell"><Topbar owner={owner} repository={repository} scope={scope} source={sourceKind} localMode={localMode} onMenu={() => setSidebarOpen(true)} /><ErrorState message={scope ? `目录 “${scope}” 中没有发现 Markdown 文件。` : '文档空间中没有发现 Markdown 文件。'} /></div>;
  if (!selectedDocument) return <div className="docs-shell"><Topbar owner={owner} repository={repository} scope={scope} source={sourceKind} localMode={localMode} onMenu={() => setSidebarOpen(true)} /><ErrorState message="找不到请求的 Markdown 文档，请从左侧目录选择一个页面。" /></div>;

  const parsed = source ? parseFrontmatter(source.content) : null;
  const tocByLine = new Map(tocEntries.map((entry) => [entry.line, entry]));
  const hasToc = viewMode === 'document' && !contentLoading && !contentError && tocEntries.length > 0;
  const viewQuery = new URLSearchParams(searchParams);
  viewQuery.delete('from');
  viewQuery.delete('to');
  viewQuery.delete('ref');
  viewQuery.delete('historyVersion');
  const currentViewQueryString = viewQuery.toString();
  const documentUrl = encodeDocumentUrl(owner, repository, selectedDocument.path);
  const documentHref = `${documentUrl}${currentViewQueryString ? `?${currentViewQueryString}` : ''}`;
  const historyPath = `${documentUrl}/history${currentViewQueryString ? `?${currentViewQueryString}` : ''}`;
  const diffPath = `${documentUrl}/diff${currentViewQueryString ? `?${currentViewQueryString}` : ''}`;
  const isHistoricalVersion = viewMode === 'document' && searchParams.get('historyVersion') === '1';
  const hideDocumentDirectory = isHistoricalVersion || viewMode === 'history' || viewMode === 'diff';
  const diffViewError = viewMode === 'diff' && (!fromRef || !toRef) ? '请在 diff URL 中提供 from 和 to 两个版本，例如 ?from=abc123&to=def456。' : diffError;
  const viewContent = viewMode === 'history' ? <HistoryView commits={history} loading={historyLoading} error={historyError} documentPath={selectedDocument.path} documentHref={documentHref} diffPath={diffPath} currentRef={currentVersion} sourceKind={sourceKind} /> : viewMode === 'diff' ? <DiffView diff={diff} before={comparisonBefore} after={comparisonAfter} provider={provider} owner={owner} repository={repository} documentPath={selectedDocument.path} loading={diffLoading} error={diffViewError} historyPath={historyPath} /> : contentLoading ? <div className="document-skeleton"><div /><div /><div /><div /></div> : contentError ? <div className="inline-error">{contentError}{localPermissionRequired && <button type="button" className="button button-primary" onClick={requestLocalReadPermission} disabled={localPermissionRequesting}>{localPermissionRequesting ? t('authorizing') : t('reauthorize')}</button>}</div> : !parsed ? <div className="document-skeleton"><div /><div /><div /><div /></div> : <><div className="document-meta"><span>{selectedDocument.path}</span>{activeRef && <span className="ref-badge">{activeRef.slice(0, 12)}</span>}<span className="document-actions"><Link to={historyPath}>{isHistoricalVersion ? t('returnToHistory') : t('history')}</Link></span></div><article ref={articleRef} className="markdown-body"><h1>{parsed.title}</h1><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'warn', trust: false }]]} components={{ h1: () => null, h2: ({ node, ...props }) => <h2 id={tocIdForNode(tocByLine, node)} {...props} />, h3: ({ node, ...props }) => <h3 id={tocIdForNode(tocByLine, node)} {...props} />, h4: ({ node, ...props }) => <h4 id={tocIdForNode(tocByLine, node)} {...props} />, h5: ({ node, ...props }) => <h5 id={tocIdForNode(tocByLine, node)} {...props} />, h6: ({ node, ...props }) => <h6 id={tocIdForNode(tocByLine, node)} {...props} />, table: ({ node, children, ...props }) => <ResizableMarkdownTable key={`${selectedDocument.path}:${node?.position?.start.offset || 0}`} tableKey={`${selectedDocument.path}:${node?.position?.start.offset || 0}`} {...props}>{children}</ResizableMarkdownTable>, ...resizableMarkdownTableComponents, a: ({ href, children, ...props }) => <a href={href} {...props} target={href?.startsWith('http') ? '_blank' : undefined} rel={href?.startsWith('http') ? 'noreferrer' : undefined}>{children}</a>, img: ({ src, alt, ...props }) => provider ? <MarkdownImage src={src} alt={alt} provider={provider} owner={owner} repository={repository} documentPath={selectedDocument.path} assetRef={activeRef} {...props} /> : null, code: ({ className, children, node, ...props }) => { const language = className?.replace('language-', ''); const meta = readCodeMeta(node); const rendererName = language === 'yaml' ? rendererNameFromMeta(meta) : undefined; const CodeRenderer = language ? rendererRegistry.getCodeBlockRenderer(language) : undefined; const codeSource = String(children).replace(/\n$/, ''); const context = { documentPath: selectedDocument.path, repository, ref: activeRef, scope }; if (rendererName) return <YamlRendererBlock name={rendererName} source={codeSource.trim()} registry={rendererRegistry} context={context} />; if (CodeRenderer && language) return <CodeRenderer source={codeSource} language={language} meta={meta} context={context} />; return <code className={`${className || ''} code-inline`} data-language={language} {...props}>{children}</code>; } }}>{parsed.content}</ReactMarkdown></article></>;
  const search = { query: searchQuery, results: searchResults, indexing, indexedCount, indexTotal, error: searchError, notice: searchNotice, onQueryChange: setSearchQuery, onResultSelect: openDocument };
  const documentFooter = viewMode === 'document' && !contentLoading && !contentError && parsed && <div className="document-footer"><span>Powered by Git MD Viewer</span><span className="footer-note">{refs.length > 0 ? 'Local Git · read-only' : sourceKind === 'local' ? 'Local folder · read-only' : `${sourceKind} · ${scope}`}</span></div>;
  return <div className="docs-shell"><Topbar owner={owner} repository={repository} scope={scope} source={sourceKind} localMode={localMode} showMenu={!hideDocumentDirectory} onMenu={() => setSidebarOpen(true)} menuExpanded={sidebarOpen} menuButtonRef={menuButtonRef} search={search} /><div className={`docs-layout ${!hideDocumentDirectory && sidebarOpen ? 'sidebar-visible' : ''}`}>{!hideDocumentDirectory && <><button type="button" className="sidebar-backdrop" onClick={closeSidebar} aria-label={t('closeDirectory')} /><Sidebar tree={tree} activePath={activePath} expandedPaths={expandedPaths} onNavigate={openDocument} onToggle={toggleSection} sources={workspaceSources} activeSourceId={activeSourceId} onSelectSource={selectWorkspaceSource} onClose={closeSidebar} collapsed={sidebarCollapsed} onCollapseToggle={() => setSidebarCollapsed((value) => !value)} containerRef={sidebarRef} /></>}<main className="docs-main"><div className={`document-wrap ${viewMode === 'diff' ? 'diff-document-wrap' : ''} ${hasToc ? 'has-table-of-contents' : ''} ${hasToc && tocCollapsed ? 'toc-collapsed' : ''} ${!hideDocumentDirectory && sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>{hasToc ? <div className="document-content-layout"><div className="document-content">{viewContent}{documentFooter}</div><DocumentToc collapsed={tocCollapsed} navRef={tocNavRef} onToggle={() => setTocCollapsed((value) => !value)} label={t('tocTitle')} collapseLabel={t('tocCollapse')} expandLabel={t('tocExpand')} /></div> : <>{viewContent}{documentFooter}</>}</div></main></div></div>;
}

function Topbar({ owner, repository, scope, source, localMode, showMenu = true, onMenu, menuExpanded = false, menuButtonRef, search }: { owner: string; repository: string; scope?: string; source: SourceKind; localMode: 'folder' | 'git'; showMenu?: boolean; onMenu: () => void; menuExpanded?: boolean; menuButtonRef?: RefObject<HTMLButtonElement>; search?: { query: string; results: DocumentSearchResult[]; indexing: boolean; indexedCount: number; indexTotal: number; error: string | null; notice: string | null; onQueryChange: (value: string) => void; onResultSelect: (path: string) => void } }) {
  const { t } = useI18n();
  const { branding } = useDocsHostConfiguration();
  const sourceLabel = source === 'bitbucket' ? 'Bitbucket' : source === 'local' ? 'Local' : 'GitHub';
  const settingsHref = source === 'local' ? `/?mode=${localMode === 'git' ? 'local-git' : 'local-folder'}` : '/?mode=repository';
  return <header className="docs-topbar">{showMenu && <button ref={menuButtonRef} type="button" className="mobile-menu" onClick={onMenu} aria-label={t('openDirectory')} aria-expanded={menuExpanded} aria-controls="document-sidebar">☰</button>}<Link to="/" className="topbar-brand"><BrandMark /><span>{branding.appName}</span></Link><span className="topbar-divider">/</span><span className="source-badge">{sourceLabel}</span><span className="repo-name">{owner && repository ? `${owner}/${repository}` : t('localFolderName')}</span><span className="topbar-spacer" />{search && <SearchControl search={search} />}{scope && <span className="topbar-scope">{t('currentDirectory', { scope })}</span>}<LanguageSwitcher /><Link className="repo-switcher" to={settingsHref} aria-label={t('settings')} title={t('settings')}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.36.7.65.96.3.26.67.4 1.06.4H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></svg></Link></header>;
}

function SearchControl({ search }: { search: { query: string; results: DocumentSearchResult[]; indexing: boolean; indexedCount: number; indexTotal: number; error: string | null; notice: string | null; onQueryChange: (value: string) => void; onResultSelect: (path: string) => void } }) {
  const { t } = useI18n();
  return <div className="document-search"><input value={search.query} onChange={(event) => search.onQueryChange(event.target.value)} placeholder={search.indexing ? t('indexing', { done: search.indexedCount, total: search.indexTotal }) : t('searchDocuments')} aria-label={t('searchDocuments')} role="combobox" aria-autocomplete="list" aria-controls="document-search-results" aria-expanded={Boolean(search.query.trim())} onKeyDown={(event) => { if (event.key === 'Escape') { search.onQueryChange(''); return; } if (event.key === 'ArrowDown') { const first = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.search-results button'); if (first) { event.preventDefault(); first.focus(); } } }} />{search.query.trim() && <div id="document-search-results" className="search-results" role="listbox">{search.indexing ? <p aria-live="polite">{t('indexing', { done: search.indexedCount, total: search.indexTotal })}…</p> : search.results.length ? <>{search.notice && <p className="search-notice">{search.notice}</p>}{search.error && <p>{search.error}</p>}{search.results.map((result) => <button role="option" aria-selected="false" key={result.path} onClick={() => { search.onResultSelect(result.path); search.onQueryChange(''); }}><strong><HighlightedSearchText text={result.title} query={search.query} /></strong><span className="search-result-path"><HighlightedSearchText text={result.path} query={search.query} /></span><span className="search-result-preview"><HighlightedSearchText text={result.snippet} query={search.query} /></span></button>)}</> : <><p>{search.error || t('noMatches')}</p>{search.notice && <p className="search-notice">{search.notice}</p>}</>}</div>}</div>;
}
