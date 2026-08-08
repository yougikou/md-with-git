import { useMemo, useState } from 'react';
import type { CodeBlockRendererProps } from './types';

const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

function demoDocument(source: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{font-family:system-ui,sans-serif;color:#1f2937}body{margin:0;padding:20px}button,input,select{font:inherit}</style></head><body>${source}</body></html>`;
}

export function IframeDemoRenderer({ source, meta }: CodeBlockRendererProps) {
  const [runId, setRunId] = useState(0);
  const title = meta.match(/(?:^|\s)title=(?:"([^"]+)"|'([^']+)'|([^\s]+))/)?.slice(1).find(Boolean) || '交互示例';
  const srcDoc = useMemo(() => demoDocument(source), [source]);
  if (source.length > 100_000) return <div className="code-plugin-fallback docs-code-plugin"><p>iframe Demo 超过 100,000 字符的安全上限。</p><code>{source.slice(0, 2_000)}…</code></div>;
  return <section className="iframe-demo docs-code-plugin"><div className="iframe-demo-toolbar"><strong>{title}</strong><span>{runId ? '隔离运行中' : '尚未运行'}</span><button type="button" onClick={() => setRunId((value) => value + 1)}>{runId ? '重新运行' : '运行'}</button>{runId > 0 && <button type="button" onClick={() => setRunId(0)}>停止</button>}</div>{runId > 0 ? <iframe key={runId} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={srcDoc} /> : <div className="iframe-demo-idle">点击“运行”后在隔离 iframe 中启动示例。</div>}</section>;
}
