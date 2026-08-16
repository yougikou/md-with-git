import { useEffect, useId, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import type { CodeBlockRendererProps } from './types';
import { useI18n } from '../../../i18n';

let mermaidModule: Promise<(typeof import('mermaid'))['default']> | undefined;

function loadMermaid() {
  if (!mermaidModule) {
    mermaidModule = Promise.all([import('mermaid'), import('@mermaid-js/layout-elk')]).then(([{ default: mermaid }, { default: elkLayouts }]) => {
      mermaid.registerLayoutLoaders(elkLayouts);
      // Upstream Mermaid's TypeScript declarations omit the parser selectors,
      // although Mermaid Chart uses them with the same Mermaid 11 API.
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        maxTextSize: 50_000,
        maxEdges: 500,
        // Mermaid Chart's fork selects ELK from a diagram's YAML config. The
        // upstream 11.16.1 package still needs this renderer flag to activate
        // the registered loader, so keep only that compatibility setting.
        theme: 'redux',
        flowchart: { parser: 'jison', defaultRenderer: 'elk' },
        sequence: { parser: 'antlr' },
      } as Parameters<typeof mermaid.initialize>[0]);
      return mermaid;
    });
  }
  return mermaidModule;
}

const minZoom = 0.25;
const maxZoom = 4;

function clampZoom(value: number): number {
  return Math.min(maxZoom, Math.max(minZoom, value));
}

export function MermaidRenderer({ source }: CodeBlockRendererProps) {
  const { t } = useI18n();
  const reactId = useId();
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number }>();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (source.length > 50_000) {
      setNearViewport(false);
      return undefined;
    }
    setNearViewport(false);
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '320px 0px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [source]);

  useEffect(() => {
    let cancelled = false;
    setSvg(''); setError(null);
    if (source.length > 50_000) {
      setError(t('mermaidTooLarge'));
      return () => { cancelled = true; };
    }
    if (!nearViewport) return () => { cancelled = true; };
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, source))
      .then((result) => { if (!cancelled) setSvg(result.svg); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t('mermaidParseFailed')); });
    return () => { cancelled = true; };
  }, [nearViewport, reactId, source, t]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const openExpanded = () => { setZoom(1); setPan({ x: 0, y: 0 }); setExpanded(true); };
  const resetViewport = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((value) => clampZoom(value * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const x = event.clientX - current.x;
    const y = event.clientY - current.y;
    drag.current = { ...current, x: event.clientX, y: event.clientY };
    setPan((value) => ({ x: value.x + x, y: value.y + y }));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    setDragging(false);
  };

  return <div ref={container} className="mermaid-renderer">
    {error ? <div className="code-plugin-fallback docs-code-plugin"><p>{t('mermaidRenderFailed')}{error}</p><code>{source}</code></div> : !nearViewport ? <div className="code-plugin-loading docs-code-plugin"><span>{t('mermaidWaitingViewport')}</span></div> : !svg ? <div className="code-plugin-loading docs-code-plugin"><span className="spinner" /><span>{t('mermaidRendering')}</span></div> : <><figure className="mermaid-diagram docs-code-plugin" aria-label={t('mermaidDiagram')}><button type="button" className="mermaid-expand-button" onClick={openExpanded} aria-label={t('mermaidExpand')} title={t('mermaidExpand')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /></svg></button><div dangerouslySetInnerHTML={{ __html: svg }} /></figure>{expanded && <div className="mermaid-modal" role="dialog" aria-modal="true" aria-label={t('mermaidExpandedView')}><button type="button" className="mermaid-modal-backdrop" onClick={() => setExpanded(false)} aria-label={t('mermaidCloseExpanded')} /><section className="mermaid-modal-panel"><header className="mermaid-modal-toolbar"><span>{t('mermaidDiagram')}</span><span className="mermaid-modal-hint">{t('mermaidZoomPanHint')}</span><button type="button" onClick={resetViewport}>{t('mermaidResetView')}</button><button type="button" className="mermaid-modal-close" onClick={() => setExpanded(false)} aria-label={t('close')}>×</button></header><div className={`mermaid-modal-canvas ${dragging ? 'dragging' : ''}`} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}><div className="mermaid-modal-artwork" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: svg }} /></div></section></div>}</>}
  </div>;
}
