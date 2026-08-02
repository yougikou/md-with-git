import type { YamlBlockRendererProps } from '@md-with-git/viewer';

export function ChangeHistoryRenderer({ value }: YamlBlockRendererProps) {
  const entries = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as { entries?: unknown }).entries
    : value;
  if (!Array.isArray(entries)) return <p>没有可显示的变更履历。</p>;
  const recent = entries.slice(0, 3) as Array<Record<string, unknown>>;
  const older = entries.slice(3) as Array<Record<string, unknown>>;
  const rows = (items: Array<Record<string, unknown>>) => items.map((entry, index) => <tr key={`${String(entry.version)}-${index}`}><td>{String(entry.version || '—')}</td><td>{String(entry.date || '—')}</td><td>{String(entry.summary || '—')}</td></tr>);
  return <section><table><thead><tr><th>版本</th><th>日期</th><th>变更</th></tr></thead><tbody>{rows(recent)}</tbody></table>{older.length > 0 && <details><summary>查看更早的 {older.length} 个变更</summary><table><tbody>{rows(older)}</tbody></table></details>}</section>;
}
