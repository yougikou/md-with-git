import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildDocumentTree, findDocument, findFirstDocument } from './tree';
import { parseFrontmatter } from './markdown';
import { GitHubProvider } from './providers';
import type { DocumentNode, RepositoryEntry, TreeNode } from './types';

const provider = new GitHubProvider();

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

function LoadingState() {
  return <div className="state-card loading-state"><div className="spinner" /><h2>正在发现文档</h2><p>正在从 GitHub 获取文件树…</p></div>;
}

export default function DocsPage() {
  const { '*': wildcard = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [entries, setEntries] = useState<RepositoryEntry[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [source, setSource] = useState<{ path: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const segments = wildcard.split('/').filter(Boolean);
  const owner = segments[0] || '';
  const repository = segments[1] || '';
  const requestedPath = segments.slice(2).join('/');
  const ref = searchParams.get('ref') || undefined;
  const activePath = source?.path || requestedPath;

  useEffect(() => {
    if (!owner || !repository) { setLoading(false); setError('请使用 /docs/:owner/:repository 打开一个公开 GitHub 仓库。'); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    provider.getTree({ owner, repository, ref }).then((nextEntries) => {
      if (cancelled) return;
      setEntries(nextEntries); setTree(buildDocumentTree(nextEntries));
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '无法读取仓库文件树。'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [owner, repository, ref]);

  const selectedDocument = useMemo(() => requestedPath ? findDocument(tree, requestedPath) : findFirstDocument(tree), [requestedPath, tree]);

  const openDocument = useCallback((path: string) => {
    navigate(`/docs/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${path.split('/').map(encodeURIComponent).join('/')}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`);
    setSidebarOpen(false);
  }, [navigate, owner, repository, ref]);

  useEffect(() => {
    if (!selectedDocument) return;
    const query = { owner, repository, path: selectedDocument.path, ref };
    let cancelled = false;
    setContentLoading(true); setError(null);
    provider.getFile(query).then((content) => { if (!cancelled) setSource({ path: selectedDocument.path, content }); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '无法读取 Markdown 文件。'); }).finally(() => { if (!cancelled) setContentLoading(false); });
    return () => { cancelled = true; };
  }, [owner, repository, ref, selectedDocument]);

  if (loading) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} onMenu={() => setSidebarOpen(true)} /><LoadingState /></div>;
  if (error && !tree.length) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} onMenu={() => setSidebarOpen(true)} /><ErrorState message={error} /></div>;
  if (!tree.length) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} onMenu={() => setSidebarOpen(true)} /><ErrorState message="仓库中没有发现 Markdown 或 MDX 文件。" /></div>;
  if (!selectedDocument) return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} onMenu={() => setSidebarOpen(true)} /><ErrorState message="找不到请求的 Markdown 文档，请从左侧目录选择一个页面。" /></div>;

  const parsed = source ? parseFrontmatter(source.content) : null;
  return <div className="docs-shell"><Topbar owner={owner} repository={repository} ref={ref} onMenu={() => setSidebarOpen(true)} /><div className={`docs-layout ${sidebarOpen ? 'sidebar-visible' : ''}`}><div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /><Sidebar tree={tree} activePath={activePath} onNavigate={openDocument} /><main className="docs-main"><div className="document-wrap">{contentLoading || !parsed ? <div className="document-skeleton"><div /><div /><div /><div /></div> : <><div className="document-meta"><span>{selectedDocument.path}</span>{ref && <span className="ref-badge">{ref.slice(0, 7)}</span>}</div><article className="markdown-body"><h1>{parsed.title}</h1><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h1: () => null, a: ({ href, children, ...props }) => <a href={href} {...props} target={href?.startsWith('http') ? '_blank' : undefined} rel={href?.startsWith('http') ? 'noreferrer' : undefined}>{children}</a>, code: ({ className, children, ...props }) => { const language = className?.replace('language-', ''); return <code className={`${className || ''} code-inline`} data-language={language} {...props}>{children}</code>; } }}>{parsed.content}</ReactMarkdown></article><div className="document-footer"><span>Powered by Git MD Viewer</span><span className="footer-note">文件历史即将加入</span></div></>}</div></main></div></div>;
}

function Topbar({ owner, repository, ref, onMenu }: { owner: string; repository: string; ref?: string; onMenu: () => void }) {
  return <header className="docs-topbar"><button className="mobile-menu" onClick={onMenu} aria-label="打开目录">☰</button><Link to="/" className="topbar-brand"><span className="brand-mark">MD</span><span>Git MD Viewer</span></Link><span className="topbar-divider">/</span><span className="repo-name">{owner && repository ? `${owner}/${repository}` : 'Repository'}</span><span className="topbar-spacer" />{ref && <span className="topbar-ref">ref: {ref}</span>}<a className="github-link" href={owner && repository ? `https://github.com/${owner}/${repository}` : 'https://github.com'} target="_blank" rel="noreferrer">View on GitHub ↗</a></header>;
}
