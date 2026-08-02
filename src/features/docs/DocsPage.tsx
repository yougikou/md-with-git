import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildDocumentTree, findDocument, findFirstDocument } from './tree';
import { parseFrontmatter, resolveAssetPath } from './markdown';
import { documentCacheKey, readMarkdownCache, writeMarkdownCache } from './cache';
import { LocalFolderPicker } from './LocalFolderPicker';
import { BitbucketProvider, getLocalFolder, GitHubProvider, registerLocalFolder } from './providers';
import type { DocumentNode, RepositoryEntry, RepositoryProvider, RepositoryRef, TreeNode } from './types';

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
  return <label className="ref-picker"><span>VERSION</span><select value={value || defaultRef || ''} onChange={(event) => onChange(event.target.value)} aria-label="选择文档版本"><optgroup label="Branches">{branchRefs.map((ref) => <option key={`branch:${ref.name}`} value={ref.name}>{ref.name}{ref.isDefault ? ' · default' : ''}</option>)}</optgroup>{tagRefs.length > 0 && <optgroup label="Tags">{tagRefs.map((ref) => <option key={`tag:${ref.name}`} value={ref.name}>{ref.name}</option>)}</optgroup>}</select></label>;
}

function sourceFromQuery(value: string | null): SourceKind {
  return value === 'bitbucket' || value === 'local' ? value : 'github';
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
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const segments = wildcard.split('/').filter(Boolean);
  const owner = segments[0] || '';
  const repository = segments[1] || '';
  const requestedPath = segments.slice(2).join('/');
  const ref = searchParams.get('ref') || undefined;
  const scope = searchParams.get('scope')?.replace(/^\/+|\/+$/g, '') || undefined;
  const sourceKind = sourceFromQuery(searchParams.get('source'));
  const localId = searchParams.get('localId');
  const provider = useMemo<RepositoryProvider | undefined>(() => {
    if (sourceKind === 'local') return getLocalFolder(localId);
    return sourceKind === 'bitbucket' ? bitbucketProvider : githubProvider;
  }, [localId, sourceKind]);
  const documentPath = scope && requestedPath === scope ? '' : requestedPath;
  const activeRef = ref || defaultRef;
  const activePath = source?.path || documentPath;

  useEffect(() => {
    if (!owner || !repository) { setLoading(false); setError('请使用 /docs/:owner/:repository 打开一个文档空间。'); return; }
    if (!provider) { setLoading(false); setError('本地文件夹会话已失效，请返回首页重新选择文件夹。'); return; }
    if (sourceKind !== 'local' && !scope) { setLoading(false); setError('请指定要渲染的文档目录，例如 ?scope=docs 或 ?scope=docs/guide。'); return; }
    let cancelled = false;
    setLoading(true); setError(null); setSource(null);
    provider.getRefs({ owner, repository, ref, rootPath: scope }).then(async (nextRefs) => {
      const nextDefault = nextRefs.find((item) => item.isDefault)?.name || nextRefs[0]?.name;
      const nextRef = ref || nextDefault;
      const nextEntries = await provider.getTree({ owner, repository, ref: nextRef, rootPath: scope });
      if (cancelled) return;
      setRefs(nextRefs); setDefaultRef(nextDefault); setTree(buildDocumentTree(nextEntries, sourceKind === 'local' ? undefined : scope));
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '无法读取文档空间。'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [owner, provider, ref, repository, scope, sourceKind]);

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

  const openLocalFolder = useCallback((files: File[]) => {
    const localId = registerLocalFolder(files);
    navigate(`/docs/local/folder?source=local&localId=${encodeURIComponent(localId)}`);
  }, [navigate]);

  useEffect(() => {
    if (!selectedDocument || !provider) return;
    const query = { owner, repository, path: selectedDocument.path, ref: activeRef };
    const cacheKey = documentCacheKey(provider.kind, { ...query, owner: sourceKind === 'local' ? (localId || owner) : owner });
    let cancelled = false;
    setContentLoading(true); setSource(null); setError(null);
    readMarkdownCache(cacheKey).then((cached) => {
      if (cached !== null) return cached;
      return provider.getFile(query).then(async (content) => { await writeMarkdownCache(cacheKey, content); return content; });
    }).then((content) => { if (!cancelled) setSource({ path: selectedDocument.path, content }); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '无法读取 Markdown 文件。'); }).finally(() => { if (!cancelled) setContentLoading(false); });
    return () => { cancelled = true; };
  }, [activeRef, localId, owner, provider, repository, selectedDocument, sourceKind]);

  if (loading) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><LoadingState source={sourceKind} /></div>;
  if (error && !tree.length) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><ErrorState message={error} /></div>;
  if (!tree.length) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><ErrorState message={scope ? `目录 “${scope}” 中没有发现 Markdown 或 MDX 文件。` : '文档空间中没有发现 Markdown 或 MDX 文件。'} /></div>;
  if (!selectedDocument) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><ErrorState message="找不到请求的 Markdown 文档，请从左侧目录选择一个页面。" /></div>;

  const parsed = source ? parseFrontmatter(source.content) : null;
  const renderImage = (src: string | undefined) => {
    if (!src || /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('#')) return src;
    return provider?.getAssetUrl({ owner, repository, path: resolveAssetPath(selectedDocument.path, src), ref: activeRef });
  };
  return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} defaultRef={defaultRef} scope={scope} source={sourceKind} refs={refs} onRefChange={changeRef} onOpenLocal={openLocalFolder} onMenu={() => setSidebarOpen(true)} /><div className={`docs-layout ${sidebarOpen ? 'sidebar-visible' : ''}`}><div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /><Sidebar tree={tree} activePath={activePath} onNavigate={openDocument} /><main className="docs-main"><div className="document-wrap">{contentLoading || !parsed ? <div className="document-skeleton"><div /><div /><div /><div /></div> : <><div className="document-meta"><span>{selectedDocument.path}</span>{activeRef && <span className="ref-badge">{activeRef.slice(0, 12)}</span>}</div><article className="markdown-body"><h1>{parsed.title}</h1><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h1: () => null, a: ({ href, children, ...props }) => <a href={href} {...props} target={href?.startsWith('http') ? '_blank' : undefined} rel={href?.startsWith('http') ? 'noreferrer' : undefined}>{children}</a>, img: ({ src, alt, ...props }) => <img src={renderImage(src) || src} alt={alt || ''} {...props} />, code: ({ className, children, ...props }) => { const language = className?.replace('language-', ''); return <code className={`${className || ''} code-inline`} data-language={language} {...props}>{children}</code>; } }}>{parsed.content}</ReactMarkdown></article><div className="document-footer"><span>Powered by Git MD Viewer</span><span className="footer-note">{sourceKind === 'local' ? 'Local folder' : `${sourceKind} · ${scope}`}</span></div></>}</div></main></div></div>;
}

function Topbar({ owner, repository, ref, defaultRef, scope, source, refs, onRefChange, onOpenLocal, onMenu }: { owner: string; repository: string; ref?: string; defaultRef?: string; scope?: string; source: SourceKind; refs: RepositoryRef[]; onRefChange: (value: string) => void; onOpenLocal: (files: File[]) => void; onMenu: () => void }) {
  const sourceLabel = source === 'bitbucket' ? 'Bitbucket' : source === 'local' ? 'Local' : 'GitHub';
  return <header className="docs-topbar"><button className="mobile-menu" onClick={onMenu} aria-label="打开目录">☰</button><Link to="/" className="topbar-brand"><span className="brand-mark">MD</span><span>Git MD Viewer</span></Link><span className="topbar-divider">/</span><span className="source-badge">{sourceLabel}</span><span className="repo-name">{owner && repository ? `${owner}/${repository}` : 'Local folder'}</span><span className="topbar-spacer" /><RefPicker refs={refs} value={ref} defaultRef={defaultRef} onChange={onRefChange} />{scope && <span className="topbar-scope">scope: {scope}</span>}<LocalFolderPicker onSelect={onOpenLocal} compact /><a className="github-link" href={source === 'github' && owner && repository ? `https://github.com/${owner}/${repository}` : source === 'bitbucket' && owner && repository ? `https://bitbucket.org/${owner}/${repository}` : '#'} target={source === 'local' ? undefined : '_blank'} rel={source === 'local' ? undefined : 'noreferrer'}>View source ↗</a></header>;
}
