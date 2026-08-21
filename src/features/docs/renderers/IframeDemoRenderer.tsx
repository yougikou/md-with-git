import { useMemo, useState } from 'react';
import type { CodeBlockRendererProps } from './types';
import { useI18n } from '../../../i18n';

const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

function demoDocument(source: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{font-family:system-ui,sans-serif;color:#1f2937}body{margin:0;padding:20px}button,input,select{font:inherit}</style></head><body>${source}</body></html>`;
}

export function IframeDemoRenderer({ source, meta }: CodeBlockRendererProps) {
  const { t } = useI18n();
  const [runId, setRunId] = useState(0);
  const title = meta.match(/(?:^|\s)title=(?:"([^"]+)"|'([^']+)'|([^\s]+))/)?.slice(1).find(Boolean) || t('interactiveDemo');
  const srcDoc = useMemo(() => demoDocument(source), [source]);
  if (source.length > 100_000) return <div className="code-plugin-fallback docs-code-plugin"><p>{t('iframeTooLarge')}</p><code>{source.slice(0, 2_000)}…</code></div>;
  return <section className="iframe-demo docs-code-plugin"><div className="iframe-demo-toolbar"><strong>{title}</strong><span>{runId ? t('iframeRunning') : t('iframeNotRunning')}</span><button type="button" onClick={() => setRunId((value) => value + 1)}>{runId ? t('iframeRerun') : t('run')}</button>{runId > 0 && <button type="button" onClick={() => setRunId(0)}>{t('stop')}</button>}</div>{runId > 0 ? <iframe key={runId} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={srcDoc} /> : <div className="iframe-demo-idle">{t('iframeRunHint')}</div>}</section>;
}
