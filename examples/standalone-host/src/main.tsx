import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DocsRendererProvider, createDocsRendererRegistry } from '@md-with-git/viewer';
import { ChangeHistoryRenderer } from './docs-renderers';

const DocsViewer = lazy(() => import('@md-with-git/viewer/DocsPage'));
const rendererRegistry = createDocsRendererRegistry();
rendererRegistry.registerYamlRenderer('change-history', ChangeHistoryRenderer);

function App() {
  return <DocsRendererProvider registry={rendererRegistry}><BrowserRouter><Suspense fallback={<p>Loading docs…</p>}><Routes><Route path="/docs/*" element={<DocsViewer />} /></Routes></Suspense></BrowserRouter></DocsRendererProvider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
