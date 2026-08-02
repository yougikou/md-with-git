import type { YamlBlockRendererProps } from '../types';

interface ChangeEntry {
  version: string;
  date: string;
  summary: string;
  breaking?: boolean;
  changes: string[];
}

function normalizeEntry(value: unknown): ChangeEntry | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const version = typeof item.version === 'string' ? item.version : '';
  const date = typeof item.date === 'string' ? item.date : '';
  const summary = typeof item.summary === 'string' ? item.summary : '';
  const changes = Array.isArray(item.changes) ? item.changes.filter((change): change is string => typeof change === 'string') : [];
  if (!version || !date || !summary) return null;
  return { version, date, summary, changes, breaking: item.breaking === true };
}

function normalizeHistory(value: unknown): ChangeEntry[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const source = Array.isArray(value) ? value : record.entries;
  if (!Array.isArray(source)) return [];
  return source.map(normalizeEntry).filter((entry): entry is ChangeEntry => entry !== null).sort((a, b) => b.date.localeCompare(a.date));
}

export function ChangeHistoryRenderer({ value }: YamlBlockRendererProps) {
  const entries = normalizeHistory(value);
  if (!entries.length) {
    return <div className="yaml-renderer-error">change-history 需要包含有效的 entries（version、date、summary）。</div>;
  }
  const recent = entries.slice(0, 3);
  const older = entries.slice(3);
  const rows = (items: ChangeEntry[]) => items.map((entry) => <tr key={`${entry.version}-${entry.date}`}><td className="change-history-version">{entry.version}{entry.breaking && <span className="change-history-breaking">BREAKING</span>}</td><td>{entry.date}</td><td><strong>{entry.summary}</strong>{entry.changes.length > 0 && <ul>{entry.changes.map((change) => <li key={change}>{change}</li>)}</ul>}</td></tr>);
  return <section className="change-history" aria-label="变更履历"><div className="change-history-heading"><span className="eyebrow">CHANGE HISTORY</span><span>{entries.length} 个版本</span></div><table><thead><tr><th>版本</th><th>日期</th><th>变更</th></tr></thead><tbody>{rows(recent)}</tbody></table>{older.length > 0 && <details><summary>查看更早的 {older.length} 个变更</summary><table><thead><tr><th>版本</th><th>日期</th><th>变更</th></tr></thead><tbody>{rows(older)}</tbody></table></details>}</section>;
}
