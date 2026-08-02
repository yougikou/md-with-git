import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { LocalFolderPicker, type LocalFolderSelection } from './features/docs/LocalFolderPicker';
import { registerLocalFolder } from './features/docs/providers';
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
        <div className="local-mode-note"><span className="eyebrow">LOCAL MODE</span><span>直接在浏览器中读取本机 Markdown 文件夹，不上传文件。</span></div>
        <div className="feature-strip">
          <div><strong>01</strong><span>文档空间</span></div>
          <div><strong>02</strong><span>GFM Markdown</span></div>
          <div><strong>03</strong><span>Commit 版本</span></div>
        </div>
      </section>
    </main>
  );
}

function NotFound() {
  return <main className="empty-page"><p className="eyebrow">404</p><h1>页面不存在</h1><Link to="/">返回首页</Link></main>;
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/docs/*" element={<DocsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
