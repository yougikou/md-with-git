import { Link } from 'react-router-dom';
import type { Commit } from './types';

export function HistoryView({ commits, loading, error, documentPath, documentHref, diffPath, currentRef, sourceKind }: { commits: Commit[]; loading: boolean; error: string | null; documentPath: string; documentHref: string; diffPath?: string; currentRef?: string; sourceKind: 'github' | 'bitbucket' | 'local' }) {
  const compareSeparator = diffPath?.includes('?') ? '&' : '?';
  const currentVersion = currentRef || '当前版本';
  return <section className="history-view"><div className="view-heading"><div><span className="eyebrow">FILE HISTORY</span><h1>{documentPath}</h1><p className="current-version">当前查看版本：<code>{currentVersion}</code></p></div><Link className="button button-quiet" to={documentHref}>返回文档</Link></div>{loading && <div className="inline-loading"><div className="spinner" />正在读取 Commit 历史…</div>}{error && <div className="inline-error">{error}</div>}{!loading && !error && !commits.length && <div className="empty-view">{sourceKind === 'local' ? '本地文件夹只提供当前文件内容，不包含 Git Commit 历史。' : '当前文件没有可显示的 Commit 历史。'}</div>}{!loading && !error && commits.length > 0 && <div className="history-list">{commits.map((commit, index) => { const versionHref = versionUrl(documentHref, commit.sha); const compareHref = diffPath && currentRef && `${diffPath}${compareSeparator}from=${encodeURIComponent(commit.sha)}&to=${encodeURIComponent(currentRef)}`; return <article className="history-item" key={commit.sha}><div className="history-marker">{index + 1}</div><div className="history-content"><div className="history-item-heading"><strong>{commit.message || '无提交说明'}</strong><time dateTime={commit.date}>{formatDate(commit.date)}</time></div><div className="history-details"><span>{commit.author}</span><code>{commit.sha.slice(0, 12)}</code><Link to={versionHref}>查看该历史版本</Link>{compareHref && <Link to={compareHref}>与当前版本比较</Link>}</div></div></article>; })}</div>}</section>;
}

function versionUrl(documentHref: string, sha: string): string {
  const [path, query = ''] = documentHref.split('?');
  const params = new URLSearchParams(query);
  params.set('ref', sha);
  return `${path}?${params.toString()}`;
}

function formatDate(value: string): string {
  if (!value) return '未知日期';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}
