import { FormEvent, StrictMode, Suspense, lazy, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { LocalFolderPicker, type LocalFolderSelection } from './features/docs/LocalFolderPicker';
import { registerLocalFolder, registerLocalGitRepository } from './features/docs/providers';
import { DocsRendererProvider, createDocsRendererRegistry } from './features/docs/renderers';
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
  const [source, setSource] = useState<'github' | 'bitbucket'>('github');
  const [owner, setOwner] = useState('');
  const [repository, setRepository] = useState('');
  const [scope, setScope] = useState('docs');
  const [ref, setRef] = useState('');

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

  return <section className="repository-form-card"><div className="repository-form-heading"><div><span className="eyebrow">OPEN A DOC SPACE</span><h2>打开 Git 仓库中的文档目录</h2></div><span className="form-hint">Git 仓库只作为文档与版本来源</span></div><form onSubmit={openRepository}><div className="repository-form-grid"><label><span>来源</span><select value={source} onChange={(event) => setSource(event.target.value as 'github' | 'bitbucket')}><option value="github">GitHub</option><option value="bitbucket">Bitbucket Cloud</option></select></label><label><span>{source === 'github' ? 'Owner' : 'Workspace'}</span><input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder={source === 'github' ? '例如 vitejs' : '例如 atlassian'} required /></label><label><span>Repository</span><input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="例如 vite" required /></label><label><span>文档目录</span><input value={scope} onChange={(event) => setScope(event.target.value)} placeholder="例如 docs/guide" required /></label><label><span>Branch / Tag（可选）</span><input value={ref} onChange={(event) => setRef(event.target.value)} placeholder="默认分支" /></label><button className="button button-primary repository-submit" type="submit">打开文档空间 <span>→</span></button></div></form></section>;
}

function localSelectionPath(item: LocalFolderSelection): string {
  if ('handle' in item || 'file' in item) return item.path.replaceAll('\\', '/');
  return (item.webkitRelativePath || item.name).replaceAll('\\', '/');
}

function LocalGitRepositorySetup() {
  const navigate = useNavigate();
  const [selection, setSelection] = useState<LocalFolderSelection[]>([]);
  const [scope, setScope] = useState('docs');
  const [error, setError] = useState('');

  const openLocalGitRepository = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedScope = scope.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (!selection.length) {
      setError('请先选择包含 .git 的项目文件夹。');
      return;
    }
    const hasGitHead = selection.some((item) => {
      const path = localSelectionPath(item);
      return path === '.git/HEAD' || path.endsWith('/.git/HEAD');
    });
    if (!hasGitHead) {
      setError('未读取到项目根目录下的 .git/HEAD。请使用原生文件夹选择器选择项目根目录。');
      return;
    }
    if (!normalizedScope) {
      setError('请填写文档目录 scope，例如 docs 或 packages/site/docs。');
      return;
    }
    const localId = registerLocalGitRepository(selection);
    const query = new URLSearchParams({ source: 'local', localMode: 'git', localId, scope: normalizedScope });
    navigate(`/docs/local/git?${query.toString()}`);
  };

  return <section className="local-git-form-card"><div className="repository-form-heading"><div><span className="eyebrow">OPEN A LOCAL GIT DOC SPACE</span><h2>设置本地 Git 仓库</h2></div><span className="form-hint">项目根目录与文档目录分开配置</span></div><form onSubmit={openLocalGitRepository}><div className="local-git-form-grid"><div><span className="local-git-label">Git 项目文件夹</span><LocalFolderPicker label="选择包含 .git 的项目文件夹" onSelect={(files) => { setSelection(files); setError(''); }} /><p className="local-git-selection">{selection.length ? `已选择项目文件夹，读取 ${selection.length} 个只读条目` : '需要选择 .git 所在的项目根目录'}</p></div><label><span>文档目录 scope（相对项目根目录）</span><input value={scope} onChange={(event) => setScope(event.target.value)} placeholder="例如 docs/guide" required /></label><button className="button button-primary" type="submit">打开本地 Git 文档 <span>→</span></button></div>{error && <p className="local-git-error">{error}</p>}<Link className="local-git-cancel" to="/?mode=repository">设置在线 Git 仓库</Link></form></section>;
}

function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isLocalGitSetup = searchParams.get('mode') === 'local-git';
  const openLocalFolder = (files: LocalFolderSelection[]) => {
    const localId = registerLocalFolder(files);
    navigate(`/docs/local/folder?source=local&localMode=folder&localId=${encodeURIComponent(localId)}`);
  };

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
          <LocalFolderPicker onSelect={openLocalFolder} />
          <Link className="button button-quiet" to="/?mode=local-git">设置本地 Git 仓库 <span>↗</span></Link>
          <Link className="button button-quiet" to="/?mode=repository">设置在线 Git 仓库 <span>↗</span></Link>
        </div>
        <div className="local-mode-note"><span className="eyebrow">LOCAL MODE</span><span>普通本地文档只选择文档文件夹；本地 Git 文档需另外选择 .git 所在项目根目录并指定 scope。</span></div>
        <div className="feature-strip">
          <div><strong>01</strong><span>文档空间</span></div>
          <div><strong>02</strong><span>GFM Markdown</span></div>
          <div><strong>03</strong><span>Commit 版本</span></div>
        </div>
        {isLocalGitSetup ? <LocalGitRepositorySetup /> : <RepositoryForm />}
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
