import { FormEvent, StrictMode, Suspense, lazy, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { LocalFolderPicker, type LocalFolderSelection } from './features/docs/LocalFolderPicker';
import { registerLocalFolder } from './features/docs/providers';
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

function HomePage() {
  const navigate = useNavigate();
  const openLocalFolder = (files: LocalFolderSelection[]) => {
    const localId = registerLocalFolder(files);
    navigate(`/docs/local/folder?source=local&localId=${encodeURIComponent(localId)}`);
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
        </div>
        <div className="local-mode-note"><span className="eyebrow">LOCAL MODE</span><span>仅按需只读你选择的文件夹，不上传、不复制整目录。</span></div>
        <div className="feature-strip">
          <div><strong>01</strong><span>文档空间</span></div>
          <div><strong>02</strong><span>GFM Markdown</span></div>
          <div><strong>03</strong><span>Commit 版本</span></div>
        </div>
        <RepositoryForm />
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
