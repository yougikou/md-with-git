import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { DocsRendererProvider, createDocsRendererRegistry, MermaidRenderer } from '@md-with-git/viewer/host';
import '@md-with-git/viewer/styles.css';
import { ChangeHistoryRenderer } from './docs-renderers';

// The host owns the only Router instance used by DocsViewer.
const DocsViewer = lazy(() => import('@md-with-git/viewer').then(({ DocsViewer: Viewer }) => ({ default: Viewer })));
const rendererRegistry = createDocsRendererRegistry();
rendererRegistry.registerYamlRenderer('change-history', ChangeHistoryRenderer);
rendererRegistry.registerCodeBlockRenderer('mermaid', MermaidRenderer);

function Home() {
  return <main><h1>Host application</h1><Link to="/docs/vitejs/vite/docs/guide?scope=docs%2Fguide">Open branded documentation</Link><p><Link to="/mermaid-smoke">Verify Mermaid development dependency</Link></p></main>;
}

function MermaidSmoke() {
  return <main><h1>Mermaid development smoke test</h1><MermaidRenderer source={`flowchart LR
  Package --> Host`} language="mermaid" meta="" context={{ documentPath: 'smoke.md', repository: 'host-smoke' }} /></main>;
}

function App() {
  return <DocsRendererProvider registry={rendererRegistry} branding={{ appName: 'Host smoke test' }}><BrowserRouter><Suspense fallback={<p>Loading docs…</p>}><Routes><Route path="/" element={<Home />} /><Route path="/mermaid-smoke" element={<MermaidSmoke />} /><Route path="/docs/*" element={<DocsViewer />} /></Routes></Suspense></BrowserRouter></DocsRendererProvider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
