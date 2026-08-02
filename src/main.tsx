import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
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
        <p className="hero-copy">自动发现目录、跟随仓库版本，并在一个干净的阅读界面里浏览公开 GitHub 文档。</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/docs/facebook/react">打开示例仓库 <span>↗</span></Link>
          <a className="button button-quiet" href="https://github.com" target="_blank" rel="noreferrer">GitHub <span>↗</span></a>
        </div>
        <div className="feature-strip">
          <div><strong>01</strong><span>自动目录树</span></div>
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
