import { FormEvent, StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { collectDirectoryFiles, LocalFolderPicker, type LocalDirectoryHandle, type LocalFolderSelection } from './features/docs/LocalFolderPicker';
import { loadLocalFolderHandles } from './features/docs/localPersistence';
import { LocalScopeTree } from './features/docs/LocalScopeTree';
import { registerLocalFolder, registerLocalGitRepository } from './features/docs/providers';
import { DocsRendererProvider, createDocsRendererRegistry } from './features/docs/renderers';
import { loadLocalFolderSettings, loadLocalGitSettings, loadOnlineRepositorySettings, saveLocalFolderSettings, saveLocalGitSettings, saveOnlineRepositorySettings } from './features/docs/setupPersistence';
import { ChangeHistoryRenderer } from '../examples/standalone-host/src/docs-renderers';
import './styles.css';

const DocsPage = lazy(() => import('./features/docs/DocsPage'));

function Loading() {
  return (
    <div className="app-loading">
      <div className="brand-mark">MD</div>
      <p>正在加载文档阅读器…</p>
    </div>
  );
}

function RepositoryForm() {
  const navigate = useNavigate();
  const [initial] = useState(loadOnlineRepositorySettings);
  const [source, setSource] = useState<'github' | 'bitbucket'>(initial.source);
  const [owner, setOwner] = useState(initial.owner);
  const [repository, setRepository] = useState(initial.repository);
  const [scope, setScope] = useState(initial.scope);
  const [ref, setRef] = useState(initial.ref);

  useEffect(() => { saveOnlineRepositorySettings({ source, owner, repository, scope, ref }); }, [owner, ref, repository, scope, source]);

  const openRepository = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedOwner = owner.trim();
    const normalizedRepository = repository.trim();
    const normalizedScope = scope.trim().replace(/^\/+|\/+$/g, '');
    if (!normalizedOwner || !normalizedRepository || !normalizedScope) return;
    const query = new URLSearchParams({ source, scope: normalizedScope });
    if (ref.trim()) query.set('ref', ref.trim());
    const path = normalizedScope.split('/').map(encodeURIComponent).join('/');
    navigate(`/docs/${encodeURIComponent(normalizedOwner)}/${encodeURIComponent(normalizedRepository)}/${path}?${query.toString()}`);
  };

  return <section className="setup-card repository-form-card"><div className="repository-form-heading"><div><span className="eyebrow">OPEN A DOC SPACE</span><h2>设置在线 Git 仓库</h2></div><span className="form-hint">Git 仓库只作为文档与版本来源</span></div><form onSubmit={openRepository}><div className="repository-form-grid"><label><span>来源</span><select value={source} onChange={(event) => setSource(event.target.value as 'github' | 'bitbucket')}><option value="github">GitHub</option><option value="bitbucket">Bitbucket Cloud</option></select></label><label><span>{source === 'github' ? 'Owner' : 'Workspace'}</span><input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder={source === 'github' ? '例如 vitejs' : '例如 atlassian'} required /></label><label><span>Repository</span><input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="例如 vite" required /></label><label><span>文档目录</span><input value={scope} onChange={(event) => setScope(event.target.value)} placeholder="例如 docs/guide" required /></label><label><span>Branch / Tag（可选）</span><input value={ref} onChange={(event) => setRef(event.target.value)} placeholder="默认分支" /></label><button className="button button-primary repository-submit" type="submit">打开文档空间 <span>→</span></button></div></form></section>;
}

function localSelectionPath(item: LocalFolderSelection): string {
  if ('handle' in item || 'file' in item) return item.path.replaceAll('\\', '/');
  return (item.webkitRelativePath || item.name).replaceAll('\\', '/');
}

function selectionIsPersistable(selection: LocalFolderSelection[]): boolean {
  return selection.some((item) => 'handle' in item);
}

function selectionDisplayPath(selection: LocalFolderSelection[], selectedPath: string): string {
  if (selectedPath) return selectedPath;
  const first = selection[0];
  if (!first) return '';
  const path = localSelectionPath(first);
  return path.includes('/') ? path.slice(0, path.indexOf('/')) : path;
}

function scopeExistsInSelection(selection: LocalFolderSelection[], scope: string): boolean {
  const rawPaths = selection.map(localSelectionPath);
  const browserRoot = selection.some((item) => !('handle' in item)) && rawPaths.length > 0 && rawPaths.every((path) => path.split('/')[0] === rawPaths[0].split('/')[0]) ? `${rawPaths[0].split('/')[0]}/` : '';
  return rawPaths.some((path) => {
    const relative = browserRoot ? path.slice(browserRoot.length) : path;
    return relative === scope || relative.startsWith(`${scope}/`);
  });
}

function LocalFolderSetup() {
  const navigate = useNavigate();
  const [initial] = useState(loadLocalFolderSettings);
  const [selection, setSelection] = useState<LocalFolderSelection[]>([]);
  const [localId, setLocalId] = useState(initial.localId || '');
  const [selectedPath, setSelectedPath] = useState(initial.path);
  const [error, setError] = useState('');
  const [rootDirectory, setRootDirectory] = useState<FileSystemDirectoryHandle>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initial.localId) return;
    loadLocalFolderHandles(initial.localId).then(setSelection).catch(() => { /* 权限失效时保留路径，等待用户重新授权。 */ });
  }, [initial.localId]);

  const selectFolder = (files: LocalFolderSelection[], path?: string, details?: { rootDirectory?: FileSystemDirectoryHandle }) => {
    const nextPath = selectionDisplayPath(files, path || '');
    setSelection(files); setLocalId(''); setRootDirectory(details?.rootDirectory); setSelectedPath(nextPath); setError('');
    saveLocalFolderSettings({ path: nextPath });
  };

  const openFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!localId && !selection.length && !rootDirectory) { setError('请先选择本地文档文件夹。'); return; }
    setLoading(true); setError('');
    try {
      const files = rootDirectory ? await collectDirectoryFiles(rootDirectory) : selection;
      const id = localId || registerLocalFolder(files);
      saveLocalFolderSettings({ localId: rootDirectory || selectionIsPersistable(files) ? id : undefined, path: selectedPath });
      navigate(`/docs/local/folder?source=local&localMode=folder&localId=${encodeURIComponent(id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取所选文件夹。');
    } finally {
      setLoading(false);
    }
  };

  return <section className="setup-card local-folder-form-card"><div className="repository-form-heading"><div><span className="eyebrow">OPEN LOCAL MARKDOWN</span><h2>选择本地文档文件夹</h2></div><span className="form-hint">浏览器只读取你明确选择的文件</span></div><form onSubmit={openFolder}><div className="local-folder-setup-grid"><div className="setup-field"><span className="local-git-label">文档文件夹</span><div className="local-folder-actions"><LocalFolderPicker label="选择本地文档文件夹" onSelect={selectFolder} /><button className="button button-primary setup-submit" type="submit" disabled={loading}>{loading ? '正在读取…' : '打开本地文档'} <span>→</span></button></div><output className="selected-folder-path">{selectedPath || '尚未选择文件夹'}</output><p className="local-git-selection">{loading ? '正在读取文件夹内容，请稍候…' : rootDirectory || selection.length ? '已读取根目录，打开时再读取其余文件。' : '选择后会显示文件夹路径，并可继续打开文档。'}</p></div></div>{error && <p className="local-git-error">{error}</p>}</form></section>;
}

function LocalGitRepositorySetup() {
  const navigate = useNavigate();
  const [initial] = useState(loadLocalGitSettings);
  const [selection, setSelection] = useState<LocalFolderSelection[]>([]);
  const [localId, setLocalId] = useState(initial.localId || '');
  const [selectedPath, setSelectedPath] = useState(initial.path);
  const [scope, setScope] = useState(initial.scope);
  const [error, setError] = useState('');
  const [rootDirectory, setRootDirectory] = useState<FileSystemDirectoryHandle>();
  const [rootDirectories, setRootDirectories] = useState<LocalDirectoryHandle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initial.localId) return;
    loadLocalFolderHandles(initial.localId).then(setSelection).catch(() => { /* 权限失效时保留路径，等待用户重新授权。 */ });
  }, [initial.localId]);

  useEffect(() => {
    if (selection.length && !rootDirectory && scope && !scopeExistsInSelection(selection, scope)) {
      setScope('');
      saveLocalGitSettings({ localId: localId || undefined, path: selectedPath, scope: '' });
    }
  }, [localId, scope, selectedPath, selection]);

  const selectRepository = (files: LocalFolderSelection[], path?: string, details?: { rootDirectory?: FileSystemDirectoryHandle; directories?: LocalDirectoryHandle[] }) => {
    const nextPath = selectionDisplayPath(files, path || '');
    setSelection(files); setLocalId(''); setRootDirectory(details?.rootDirectory); setRootDirectories(details?.directories || []); setSelectedPath(nextPath); setError('');
    saveLocalGitSettings({ path: nextPath, scope });
  };

  const openLocalGitRepository = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedScope = scope.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (!selection.length && !localId && !rootDirectory) {
      setError('请先选择包含 .git 的项目文件夹。');
      return;
    }
    if (!normalizedScope) {
      setError('请从树状目录中选择文档目录 scope。');
      return;
    }
    setLoading(true); setError('');
    try {
      const files = rootDirectory ? await collectDirectoryFiles(rootDirectory) : selection;
      const hasGitHead = files.some((item) => {
        const path = localSelectionPath(item);
        return path === '.git/HEAD' || path.endsWith('/.git/HEAD');
      });
      if (!hasGitHead) throw new Error('未读取到项目根目录下的 .git/HEAD。请使用原生文件夹选择器选择项目根目录。');
      if (!scopeExistsInSelection(files, normalizedScope)) throw new Error(`目录 “${normalizedScope}” 不在所选项目根目录中，请重新选择 scope。`);
      const nextId = localId || registerLocalGitRepository(files);
      saveLocalGitSettings({ localId: rootDirectory || selectionIsPersistable(files) ? nextId : undefined, path: selectedPath, scope: normalizedScope });
      const query = new URLSearchParams({ source: 'local', localMode: 'git', localId: nextId, scope: normalizedScope });
      navigate(`/docs/local/git?${query.toString()}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取所选 Git 仓库。');
    } finally {
      setLoading(false);
    }
  };

  return <section className="setup-card local-git-form-card"><div className="repository-form-heading"><div><span className="eyebrow">OPEN A LOCAL GIT DOC SPACE</span><h2>设置本地 Git 仓库</h2></div><span className="form-hint">项目根目录只选择一次，scope 从文件树中单选</span></div><form onSubmit={openLocalGitRepository}><div className="local-git-setup-grid"><div className="setup-field"><span className="local-git-label">Git 项目根目录</span><div className="local-git-actions"><LocalFolderPicker label="选择包含 .git 的项目文件夹" onSelect={selectRepository} /><button className="button button-primary setup-submit" type="submit" disabled={loading}>{loading ? '正在读取…' : '打开本地 Git 文档'} <span>→</span></button></div><output className="selected-folder-path">{selectedPath || '尚未选择项目根目录'}</output><p className="local-git-selection">{loading ? '正在读取 Git 文件，请稍候…' : rootDirectory || selection.length ? '已读取根目录，打开时再读取其余文件；根目录不会再次选择。' : '选择包含 .git 的项目根目录。'}</p></div><div className="setup-field"><span className="local-git-label">文档目录（仅限单选）</span><LocalScopeTree files={selection} directories={rootDirectory ? rootDirectories : undefined} value={scope} onChange={(value) => { setScope(value); setError(''); saveLocalGitSettings({ localId: localId || undefined, path: selectedPath, scope: value }); }} /><p className="local-git-selection">选中文档目录：{scope || '尚未选择'}</p></div></div>{error && <p className="local-git-error">{error}</p>}<Link className="local-git-cancel" to="/?mode=repository">设置在线 Git 仓库</Link></form></section>;
}

function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isLocalGitSetup = searchParams.get('mode') === 'local-git';
  const isLocalFolderSetup = searchParams.get('mode') === 'local-folder';

  return (
    <main className="landing-shell">
      <div className="landing-glow" />
      <nav className="landing-nav">
        <Link to="/" className="brand"><span className="brand-mark">MD</span> Git MD Viewer</Link>
        <span className="eyebrow">PHASE 1 · CORE VIEWER</span>
      </nav>
      <section className="hero">
        <p className="eyebrow">DOCUMENTATION, WITH HISTORY</p>
        <h1>把 Git 仓库里的 Markdown，<em>变成可读的文档空间。</em></h1>
        <p className="hero-copy">指定一个 Git 仓库中的文档空间，自动发现目录、跟随仓库版本，并在一个干净的阅读界面里浏览 Markdown。</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/docs/vitejs/vite/docs/guide?scope=docs%2Fguide">打开示例文档 <span>↗</span></Link>
          <Link className="button button-quiet" to="/?mode=local-folder">选择本地文档文件夹 <span>↗</span></Link>
          <Link className="button button-quiet" to="/?mode=local-git">设置本地 Git 仓库 <span>↗</span></Link>
          <Link className="button button-quiet" to="/?mode=repository">设置在线 Git 仓库 <span>↗</span></Link>
        </div>
        <div className="local-mode-note"><span className="eyebrow">LOCAL MODE</span><span>普通本地文档、本地 Git 文档和在线 Git 文档都先完成设置，再打开文档空间。</span></div>
        {isLocalFolderSetup ? <LocalFolderSetup /> : isLocalGitSetup ? <LocalGitRepositorySetup /> : <RepositoryForm />}
      </section>
    </main>
  );
}

function NotFound() {
  return <main className="empty-page"><p className="eyebrow">404</p><h1>页面不存在</h1><Link to="/">返回首页</Link></main>;
}

function App() {
  const rendererRegistry = createDocsRendererRegistry({ 'change-history': ChangeHistoryRenderer });
  return (
    <DocsRendererProvider registry={rendererRegistry}>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/docs/*" element={<DocsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </DocsRendererProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
