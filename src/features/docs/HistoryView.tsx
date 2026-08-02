import type { Commit } from './types';

export function HistoryView({ commits, loading, error, documentPath, historyPath, diffPath, sourceKind }: { commits: Commit[]; loading: boolean; error: string | null; documentPath: string; historyPath: string; diffPath?: string; sourceKind: 'github' | 'bitbucket' | 'local' }) {
  const compareSeparator = diffPath?.includes('?') ? '&' : '?';
  return <section className="history-view"><div className="view-heading"><div><span className="eyebrow">FILE HISTORY</span><h1>{documentPath}</h1></div><a className="button button-quiet" href={historyPath}>返回文档</a></div>{loading && <div className="inline-loading"><div className="spinner" />正在读取 Commit 历史…</div>}{error && <div className="inline-error">{error}</div>}{!loading && !error && !commits.length && <div className="empty-view">{sourceKind === 'local' ? '本地文件夹只提供当前文件内容，不包含 Git Commit 历史。' : '当前文件没有可显示的 Commit 历史。'}</div>}{!loading && !error && commits.length > 0 && <div className="history-list">{commits.map((commit, index) => <article className="history-item" key={commit.sha}><div className="history-marker">{index + 1}</div><div className="history-content"><div className="history-item-heading"><strong>{commit.message || '无提交说明'}</strong><time dateTime={commit.date}>{formatDate(commit.date)}</time></div><div className="history-details"><span>{commit.author}</span><code>{commit.sha.slice(0, 12)}</code>{commit.url && <a href={commit.url} target="_blank" rel="noreferrer">查看提交 ↗</a>}{index + 1 < commits.length && diffPath && <a href={`${diffPath}${compareSeparator}from=${encodeURIComponent(commit.sha)}&to=${encodeURIComponent(commits[index + 1].sha)}`}>与上一个版本比较</a>}</div></div></article>)}</div>}</section>;
}

function formatDate(value: string): string {
  if (!value) return '未知日期';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}
