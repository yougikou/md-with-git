import { useEffect, useId, useRef, useState } from 'react';
import type { CodeBlockRendererProps } from './types';

let mermaidModule: Promise<(typeof import('mermaid'))['default']> | undefined;

function loadMermaid() {
  if (!mermaidModule) {
    mermaidModule = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        maxTextSize: 50_000,
        maxEdges: 500,
        theme: 'neutral',
        flowchart: { htmlLabels: false, useMaxWidth: true },
      });
      return mermaid;
    });
  }
  return mermaidModule;
}

export function MermaidRenderer({ source }: CodeBlockRendererProps) {
  const reactId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nearViewport, setNearViewport] = useState(false);

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
      setError('Mermaid 图表超过 50,000 字符的安全上限。');
      return () => { cancelled = true; };
    }
    if (!nearViewport) return () => { cancelled = true; };
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, source))
      .then((result) => { if (!cancelled) setSvg(result.svg); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Mermaid 图表解析失败。'); });
    return () => { cancelled = true; };
  }, [nearViewport, reactId, source]);

  return <div ref={container} className="mermaid-renderer">
    {error ? <div className="code-plugin-fallback docs-code-plugin"><p>Mermaid 渲染失败：{error}</p><code>{source}</code></div> : !nearViewport ? <div className="code-plugin-loading docs-code-plugin"><span>图表进入可视区域后加载…</span></div> : !svg ? <div className="code-plugin-loading docs-code-plugin"><span className="spinner" /><span>正在渲染 Mermaid 图表…</span></div> : <figure className="mermaid-diagram docs-code-plugin" aria-label="Mermaid 图表" dangerouslySetInnerHTML={{ __html: svg }} />}
  </div>;
}
