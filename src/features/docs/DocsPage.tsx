import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildDocumentTree, findDocument, findFirstDocument } from './tree';
import { parseFrontmatter, resolveAssetPath } from './markdown';
import { documentCacheKey, readMarkdownCache, writeMarkdownCache } from './cache';
import { LocalFolderPicker, type LocalFolderSelection } from './LocalFolderPicker';
import { BitbucketProvider, getLocalFolder, GitHubProvider, registerLocalFolder } from './providers';
import type { DocumentNode, RepositoryEntry, RepositoryProvider, RepositoryRef, TreeNode } from './types';
import type { ImgHTMLAttributes } from 'react';
import { parse as parseYaml } from 'yaml';
import { useDocsRendererRegistry } from './renderers';
import type { DocsRendererRegistry, YamlBlockContext } from './renderers';
import { HistoryView } from './HistoryView';
import { DiffView } from './DiffView';
import type { Commit, DiffResult } from './types';
import { encodeDocumentUrl, parseDocumentRoute } from './versionRoutes';

const githubProvider = new GitHubProvider();
const bitbucketProvider = new BitbucketProvider();
type SourceKind = 'github' | 'bitbucket' | 'local';

function ErrorState({ message }: { message: string }) {
  return <div className="state-card error-state"><span className="state-icon">!</span><h2>文档加载失败</h2><p>{message}</p><Link to="/" className="button button-primary">返回首页</Link></div>;
}

function SidebarNode({ node, activePath, onNavigate }: { node: TreeNode; activePath: string; onNavigate: (path: string) => void }) {
  const [open, setOpen] = useState(true);
  if (node.kind === 'document') {
    return <button className={`sidebar-link ${activePath === node.path ? 'active' : ''}`} onClick={() => onNavigate(node.path)}><span className="file-icon">{node.isIndex ? '⌂' : '·'}</span>{node.title}</button>;
  }
  return <div className="sidebar-group"><button className="sidebar-section" onClick={() => setOpen((value) => !value)}><span className={`chevron ${open ? 'open' : ''}`}>›</span><span>{node.title}</span></button>{open && <div className="sidebar-children">{node.children.map((child) => <SidebarNode key={child.path} node={child} activePath={activePath} onNavigate={onNavigate} />)}</div>}</div>;
}

function Sidebar({ tree, activePath, onNavigate }: { tree: TreeNode[]; activePath: string; onNavigate: (path: string) => void }) {
  return <aside className="docs-sidebar"><div className="sidebar-heading"><span className="sidebar-kicker">DOCUMENTATION</span><span className="tree-count">{countDocuments(tree)} pages</span></div><nav>{tree.map((node) => <SidebarNode key={node.path} node={node} activePath={activePath} onNavigate={onNavigate} />)}</nav></aside>;
}

function countDocuments(nodes: TreeNode[]): number {
  return nodes.reduce((count, node) => count + (node.kind === 'document' ? 1 : countDocuments(node.children)), 0);
}

function LoadingState({ source }: { source: SourceKind }) {
  const label = source === 'local' ? '本地文件夹' : source === 'bitbucket' ? 'Bitbucket' : 'GitHub';
  return <div className="state-card loading-state"><div className="spinner" /><h2>正在发现文档</h2><p>正在从 {label} 获取文档空间…</p></div>;
}

function RefPicker({ refs, value, defaultRef, onChange }: { refs: RepositoryRef[]; value?: string; defaultRef?: string; onChange: (value: string) => void }) {
  if (!refs.length) return null;
  const branchRefs = refs.filter((ref) => ref.type === 'branch');
  const tagRefs = refs.filter((ref) => ref.type === 'tag');
  const selectedValue = value || defaultRef || '';
  const selectedInRefs = refs.some((ref) => ref.name === selectedValue);
  return <label className="ref-picker"><span>VERSION</span><select value={selectedValue} onChange={(event) => onChange(event.target.value)} aria-label="选择文档版本">{selectedValue && !selectedInRefs && <option value={selectedValue}>{selectedValue.slice(0, 12)} · current commit</option>}<optgroup label="Branches">{branchRefs.map((ref) => <option key={`branch:${ref.name}`} value={ref.name}>{ref.name}{ref.isDefault ? ' · default' : ''}</option>)}</optgroup>{tagRefs.length > 0 && <optgroup label="Tags">{tagRefs.map((ref) => <option key={`tag:${ref.name}`} value={ref.name}>{ref.name}</option>)}</optgroup>}</select></label>;
}

function MarkdownImage({ src, alt, provider, owner, repository, documentPath, assetRef, ...props }: ImgHTMLAttributes<HTMLImageElement> & { provider: RepositoryProvider; owner: string; repository: string; documentPath: string; assetRef?: string }) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  useEffect(() => {
    let cancelled = false;
    if (!src || /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('#')) { setResolvedSrc(src); return () => { cancelled = true; }; }
    const assetPath = resolveAssetPath(documentPath, src);
    Promise.resolve(provider.getAssetUrl({ owner, repository, path: assetPath, ref: assetRef })).then((url) => { if (!cancelled) setResolvedSrc(url || src); });
    return () => { cancelled = true; };
  }, [assetRef, documentPath, owner, provider, repository, src]);
  return <img {...props} src={resolvedSrc} alt={alt || ''} />;
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
  const { '*': wildcard = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [source, setSource] = useState<{ path: string; content: string } | null>(null);
  const [refs, setRefs] = useState<RepositoryRef[]>([]);
  const [defaultRef, setDefaultRef] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState<Commit[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
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
  const localProvider = useMemo(() => sourceKind === 'local' ? getLocalFolder(localId, localMode) : undefined, [localId, localMode, sourceKind]);
  const provider = useMemo<RepositoryProvider | undefined>(() => {
    if (sourceKind === 'local') return localProvider;
    return sourceKind === 'bitbucket' ? bitbucketProvider : githubProvider;
  }, [localProvider, sourceKind]);
  const documentPath = scope && requestedPath === scope ? '' : requestedPath;
  const activeRef = ref || defaultRef;
  const currentVersion = refs.find((item) => item.name === activeRef)?.sha || activeRef;
  const activePath = source?.path || documentPath;

  useEffect(() => {
    if (!owner || !repository) { setLoading(false); setError('请使用 /docs/:owner/:repository 打开一个文档空间。'); return; }
    if (!provider) { setLoading(false); setError(localMode === 'git' ? '当前本地 Git 仓库访问会话已结束，请重新设置本地 Git 仓库。' : '当前本地文档访问会话已结束，请使用顶栏“本地文档”重新选择文件夹。'); return; }
    if (sourceKind !== 'local' && !scope) { setLoading(false); setError('请指定要渲染的文档目录，例如 ?scope=docs 或 ?scope=docs/guide。'); return; }
    if (sourceKind === 'local' && localMode === 'git' && !scope) { setLoading(false); setError('本地 Git 仓库必须指定文档目录 scope，例如 ?scope=docs。'); return; }
    let cancelled = false;
    setLoading(true); setError(null); setSource(null);
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
    loadTree().catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '无法读取文档空间。'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [localMode, localProvider, owner, provider, ref, repository, scope, sourceKind]);

  const selectedDocument = useMemo(() => documentPath ? findDocument(tree, documentPath) : findFirstDocument(tree), [documentPath, tree]);

  const openDocument = useCallback((path: string) => {
    const query = new URLSearchParams(searchParams);
    const queryString = query.toString();
    navigate(`/docs/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${path.split('/').map(encodeURIComponent).join('/')}${queryString ? `?${queryString}` : ''}`);
    setSidebarOpen(false);
  }, [navigate, owner, repository, searchParams]);

  const changeRef = useCallback((nextRef: string) => {
    const query = new URLSearchParams(searchParams);
    query.set('ref', nextRef);
    navigate(`${location.pathname}?${query.toString()}`);
  }, [location.pathname, navigate, searchParams]);

  const openLocalFolder = useCallback((files: LocalFolderSelection[]) => {
    const localId = registerLocalFolder(files);
    navigate(`/docs/local/folder?source=local&localMode=folder&localId=${encodeURIComponent(localId)}`);
  }, [navigate]);

  useEffect(() => {
    if (!selectedDocument || !provider) return;
    if (viewMode !== 'document') { setContentLoading(false); setContentError(null); setSource(null); return; }
    const query = { owner, repository, path: selectedDocument.path, ref: activeRef };
    const cacheKey = provider.kind === 'local' ? null : documentCacheKey(provider.kind, { ...query, owner: owner });
    let cancelled = false;
    setContentLoading(true); setSource(null); setContentError(null);
    const readContent = cacheKey ? readMarkdownCache(cacheKey).then((cached) => {
      if (cached !== null) return cached;
      return provider.getFile(query).then(async (content) => { await writeMarkdownCache(cacheKey, content); return content; });
    }) : provider.getFile(query);
    readContent.then((content) => { if (!cancelled) setSource({ path: selectedDocument.path, content }); }).catch((reason: unknown) => { if (!cancelled) setContentError(reason instanceof Error ? reason.message : '无法读取 Markdown 文件。'); }).finally(() => { if (!cancelled) setContentLoading(false); });
    return () => { cancelled = true; };
  }, [activeRef, localId, owner, provider, repository, selectedDocument, sourceKind, viewMode]);

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
    setDiffLoading(true); setDiffError(null); setDiff(null);
    provider.compare({ owner, repository, path: selectedDocument.path, ref: activeRef, from: fromRef, to: toRef }).then((result) => { if (!cancelled) setDiff(result); }).catch((reason: unknown) => { if (!cancelled) setDiffError(reason instanceof Error ? reason.message : '无法比较文档版本。'); }).finally(() => { if (!cancelled) setDiffLoading(false); });
    return () => { cancelled = true; };
  }, [activeRef, fromRef, owner, provider, repository, selectedDocument, toRef, viewMode]);

  if (loading) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} localMode={localMode} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><LoadingState source={sourceKind} /></div>;
  if (error && !tree.length) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} localMode={localMode} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><ErrorState message={error} /></div>;
  if (!tree.length) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} localMode={localMode} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><ErrorState message={scope ? `目录 “${scope}” 中没有发现 Markdown 或 MDX 文件。` : '文档空间中没有发现 Markdown 或 MDX 文件。'} /></div>;
  if (!selectedDocument) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} localMode={localMode} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><ErrorState message="找不到请求的 Markdown 文档，请从左侧目录选择一个页面。" /></div>;

  const parsed = source ? parseFrontmatter(source.content) : null;
  const viewQuery = new URLSearchParams(searchParams);
  viewQuery.delete('from');
  viewQuery.delete('to');
  const viewQueryString = viewQuery.toString();
  const documentUrl = encodeDocumentUrl(owner, repository, selectedDocument.path);
  const documentHref = `${documentUrl}${viewQueryString ? `?${viewQueryString}` : ''}`;
  const historyPath = `${documentUrl}/history${viewQueryString ? `?${viewQueryString}` : ''}`;
  const diffPath = `${documentUrl}/diff${viewQueryString ? `?${viewQueryString}` : ''}`;
  const diffViewError = viewMode === 'diff' && (!fromRef || !toRef) ? '请在 diff URL 中提供 from 和 to 两个版本，例如 ?from=abc123&to=def456。' : diffError;
  const viewContent = viewMode === 'history' ? <HistoryView commits={history} loading={historyLoading} error={historyError} documentPath={selectedDocument.path} documentHref={documentHref} diffPath={diffPath} currentRef={currentVersion} sourceKind={sourceKind} /> : viewMode === 'diff' ? <DiffView diff={diff} loading={diffLoading} error={diffViewError} historyPath={historyPath} /> : contentLoading ? <div className="document-skeleton"><div /><div /><div /><div /></div> : contentError ? <div className="inline-error">{contentError}</div> : !parsed ? <div className="document-skeleton"><div /><div /><div /><div /></div> : <><div className="document-meta"><span>{selectedDocument.path}</span>{activeRef && <span className="ref-badge">{activeRef.slice(0, 12)}</span>}<span className="document-actions"><Link to={historyPath}>History</Link></span></div><article className="markdown-body"><h1>{parsed.title}</h1><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h1: () => null, a: ({ href, children, ...props }) => <a href={href} {...props} target={href?.startsWith('http') ? '_blank' : undefined} rel={href?.startsWith('http') ? 'noreferrer' : undefined}>{children}</a>, img: ({ src, alt, ...props }) => provider ? <MarkdownImage src={src} alt={alt} provider={provider} owner={owner} repository={repository} documentPath={selectedDocument.path} assetRef={activeRef} {...props} /> : null, code: ({ className, children, node, ...props }) => { const language = className?.replace('language-', ''); const rendererName = language === 'yaml' ? rendererNameFromMeta(readCodeMeta(node)) : undefined; if (rendererName) return <YamlRendererBlock name={rendererName} source={String(children).trim()} registry={rendererRegistry} context={{ documentPath: selectedDocument.path, repository, ref: activeRef, scope }} />; return <code className={`${className || ''} code-inline`} data-language={language} {...props}>{children}</code>; } }}>{parsed.content}</ReactMarkdown></article></>;
  return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} localMode={localMode} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><div className={`docs-layout ${sidebarOpen ? 'sidebar-visible' : ''}`}><div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /><Sidebar tree={tree} activePath={activePath} onNavigate={openDocument} /><main className="docs-main"><div className="document-wrap">{viewContent}{viewMode === 'document' && !contentLoading && !contentError && parsed && <div className="document-footer"><span>Powered by Git MD Viewer</span><span className="footer-note">{refs.length > 0 ? 'Local Git · read-only' : sourceKind === 'local' ? 'Local folder · read-only' : `${sourceKind} · ${scope}`}</span></div>}</div></main></div></div>;
}

function Topbar({ owner, repository, ref, defaultRef, scope, source, localMode, refs, onRefChange, onOpenLocal, onMenu }: { owner: string; repository: string; ref?: string; defaultRef?: string; scope?: string; source: SourceKind; localMode: 'folder' | 'git'; refs: RepositoryRef[]; onRefChange: (value: string) => void; onOpenLocal: (files: LocalFolderSelection[]) => void; onMenu: () => void }) {
  const sourceLabel = source === 'bitbucket' ? 'Bitbucket' : source === 'local' ? 'Local' : 'GitHub';
  const switcher = source === 'local' ? (localMode === 'git' ? { href: '/?mode=repository', label: '设置在线 Git' } : { href: '/?mode=local-git', label: '设置本地 Git' }) : { href: '/?mode=repository', label: '打开 Git 仓库' };
  return <header className="docs-topbar"><button className="mobile-menu" onClick={onMenu} aria-label="打开目录">☰</button><Link to="/" className="topbar-brand"><span className="brand-mark">MD</span><span>Git MD Viewer</span></Link><span className="topbar-divider">/</span><span className="source-badge">{sourceLabel}</span><span className="repo-name">{owner && repository ? `${owner}/${repository}` : 'Local folder'}</span><span className="topbar-spacer" />{refs.length > 0 && <RefPicker refs={refs} value={ref} defaultRef={defaultRef} onChange={onRefChange} />}{scope && <span className="topbar-scope">scope: {scope}</span>}<Link className="repo-switcher" to={switcher.href}>{switcher.label}</Link><LocalFolderPicker onSelect={onOpenLocal} compact compactLabel="本地文档" /><a className="github-link" href={source === 'github' && owner && repository ? `https://github.com/${owner}/${repository}` : source === 'bitbucket' && owner && repository ? `https://bitbucket.org/${owner}/${repository}` : '#'} target={source === 'local' ? undefined : '_blank'} rel={source === 'local' ? undefined : 'noreferrer'}>View source ↗</a></header>;
}
