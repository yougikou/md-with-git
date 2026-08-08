import { Link } from 'react-router-dom';
import type { Commit } from './types';
import { buildComparisonUrl, buildVersionUrl } from './versionRoutes';
import { useI18n } from '../../i18n';

export function HistoryView({ commits, loading, error, documentPath, documentHref, diffPath, currentRef, sourceKind }: { commits: Commit[]; loading: boolean; error: string | null; documentPath: string; documentHref: string; diffPath?: string; currentRef?: string; sourceKind: 'github' | 'bitbucket' | 'local' }) {
  const { t, locale } = useI18n();
  const currentVersion = currentRef || t('currentVersion');
  return <section className="history-view"><div className="view-heading"><div><span className="eyebrow">FILE HISTORY</span><h1>{documentPath}</h1><p className="current-version">{t('viewingVersion')}<code>{currentVersion}</code></p></div><Link className="button button-quiet" to={documentHref}>{t('returnToDocument')}</Link></div>{loading && <div className="inline-loading"><div className="spinner" />{t('readingHistory')}</div>}{error && <div className="inline-error">{error}</div>}{!loading && !error && !commits.length && <div className="empty-view">{sourceKind === 'local' ? t('localNoHistory') : t('noHistory')}</div>}{!loading && !error && commits.length > 0 && <div className="history-list">{commits.map((commit, index) => { const versionHref = buildVersionUrl(documentHref, commit.sha); const compareHref = diffPath && currentRef ? buildComparisonUrl(diffPath, commit.sha, currentRef) : undefined; return <article className="history-item" key={commit.sha}><div className="history-marker">{index + 1}</div><div className="history-content"><div className="history-item-heading"><strong>{commit.message || t('noCommitMessage')}</strong><time dateTime={commit.date}>{formatDate(commit.date, locale, t('unknownDate'))}</time></div><div className="history-details"><span>{commit.author}</span><code>{commit.sha.slice(0, 12)}</code><Link to={versionHref}>{t('viewVersion')}</Link>{compareHref && <Link to={compareHref}>{t('compareCurrent')}</Link>}</div></div></article>; })}</div>}</section>;
}

function formatDate(value: string, locale: string, unknownDate: string): string {
  if (!value) return unknownDate;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}
