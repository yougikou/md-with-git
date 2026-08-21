import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ImgHTMLAttributes } from 'react';
import { useResolvedAssetUrl } from './assetUrls';
import type { DiffResult, RepositoryProvider } from './types';
import { useI18n } from '../../i18n';
import { ResizableMarkdownTable, resizableMarkdownTableComponents } from './ResizableMarkdownTable';

type ChangeKind = 'unchanged' | 'added' | 'removed' | 'modified';

interface ComparisonBlock {
  kind: ChangeKind;
  before?: string;
  after?: string;
}

function withoutFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function splitMarkdownBlocks(markdown: string): string[] {
  const lines = withoutFrontmatter(markdown).replaceAll('\r\n', '\n').split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let fence = '';

  const flush = () => {
    const content = current.join('\n').trim();
    if (content) blocks.push(content);
    current = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (!fence) {
        flush();
        fence = fenceMatch[1];
      } else if (line.trimStart().startsWith(fence)) {
        current.push(line);
        flush();
        fence = '';
        continue;
      }
      current.push(line);
      continue;
    }
    if (fence) {
      current.push(line);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(line) || /^\s*([-*+]\s+|\d+[.)]\s+|>)\s*/.test(line)) {
      if (/^#{1,6}\s/.test(line)) flush();
      current.push(line);
      continue;
    }
    const nextLine = lines[index + 1] || '';
    if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextLine)) {
      flush();
      current.push(line);
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

function normalizeBlock(block: string): string {
  return block.replaceAll('\r\n', '\n').replace(/\s+/g, ' ').trim();
}

export function compareMarkdownDocuments(before: string, after: string): ComparisonBlock[] {
  const beforeBlocks = splitMarkdownBlocks(before);
  const afterBlocks = splitMarkdownBlocks(after);
  const matrix = Array.from({ length: beforeBlocks.length + 1 }, () => Array<number>(afterBlocks.length + 1).fill(0));

  for (let beforeIndex = beforeBlocks.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterBlocks.length - 1; afterIndex >= 0; afterIndex -= 1) {
      matrix[beforeIndex][afterIndex] = normalizeBlock(beforeBlocks[beforeIndex]) === normalizeBlock(afterBlocks[afterIndex])
        ? matrix[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(matrix[beforeIndex + 1][afterIndex], matrix[beforeIndex][afterIndex + 1]);
    }
  }

  const blocks: ComparisonBlock[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  const emitChangedRange = (beforeEnd: number, afterEnd: number) => {
    while (beforeIndex < beforeEnd && afterIndex < afterEnd) {
      blocks.push({ kind: 'modified', before: beforeBlocks[beforeIndex], after: afterBlocks[afterIndex] });
      beforeIndex += 1;
      afterIndex += 1;
    }
    while (beforeIndex < beforeEnd) blocks.push({ kind: 'removed', before: beforeBlocks[beforeIndex++] });
    while (afterIndex < afterEnd) blocks.push({ kind: 'added', after: afterBlocks[afterIndex++] });
  };

  while (beforeIndex < beforeBlocks.length || afterIndex < afterBlocks.length) {
    if (beforeIndex < beforeBlocks.length && afterIndex < afterBlocks.length && normalizeBlock(beforeBlocks[beforeIndex]) === normalizeBlock(afterBlocks[afterIndex])) {
      blocks.push({ kind: 'unchanged', after: afterBlocks[afterIndex] });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }
    let beforeMatch = beforeIndex;
    let afterMatch = afterIndex;
    while (beforeMatch < beforeBlocks.length && afterMatch < afterBlocks.length && normalizeBlock(beforeBlocks[beforeMatch]) !== normalizeBlock(afterBlocks[afterMatch])) {
      if (matrix[beforeMatch + 1][afterMatch] >= matrix[beforeMatch][afterMatch + 1]) beforeMatch += 1;
      else afterMatch += 1;
    }
    emitChangedRange(beforeMatch, afterMatch);
  }
  return blocks;
}

function ComparisonMarkdownImage({ src, alt, provider, owner, repository, documentPath, assetRef, ...props }: ImgHTMLAttributes<HTMLImageElement> & { provider: RepositoryProvider; owner: string; repository: string; documentPath: string; assetRef: string }) {
  const resolvedSrc = useResolvedAssetUrl({ src, provider, owner, repository, documentPath, assetRef });
  return <img {...props} src={resolvedSrc} alt={alt || ''} />;
}

function MarkdownBlock({ content, provider, owner, repository, documentPath, assetRef }: { content: string; provider?: RepositoryProvider; owner: string; repository: string; documentPath: string; assetRef: string }) {
  return <div className="markdown-body diff-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: ({ node, children, ...props }) => <ResizableMarkdownTable key={`${documentPath}:${assetRef}:${node?.position?.start.offset || 0}`} tableKey={`${documentPath}:${assetRef}:${node?.position?.start.offset || 0}`} {...props}>{children}</ResizableMarkdownTable>, ...resizableMarkdownTableComponents, img: ({ src, alt, ...props }) => provider ? <ComparisonMarkdownImage src={src} alt={alt} provider={provider} owner={owner} repository={repository} documentPath={documentPath} assetRef={assetRef} {...props} /> : <img src={src} alt={alt || ''} {...props} /> }}>{content}</ReactMarkdown></div>;
}

function DocumentComparison({ before, after, provider, owner, repository, documentPath, fromRef, toRef }: { before: string; after: string; provider?: RepositoryProvider; owner: string; repository: string; documentPath: string; fromRef: string; toRef: string }) {
  const { t } = useI18n();
  const blocks = compareMarkdownDocuments(before, after);
  if (!blocks.length) return <div className="empty-view">{t('sameDocument')}</div>;
  const renderBlock = (content: string, ref: string) => <MarkdownBlock content={content} provider={provider} owner={owner} repository={repository} documentPath={documentPath} assetRef={ref} />;
  return <div className="diff-document">{blocks.map((block, index) => {
    if (block.kind === 'unchanged') return <section className="diff-document-block unchanged" key={index}>{renderBlock(block.after || '', toRef)}</section>;
    if (block.kind === 'added') return <section className="diff-document-block added" key={index}><span className="diff-change-label">{t('added')}</span>{renderBlock(block.after || '', toRef)}</section>;
    if (block.kind === 'removed') return <section className="diff-document-block removed" key={index}><span className="diff-change-label">{t('removed')}</span>{renderBlock(block.before || '', fromRef)}</section>;
    return <section className="diff-document-block modified" key={index}><div className="diff-document-before"><span className="diff-change-label">{t('before')}</span>{renderBlock(block.before || '', fromRef)}</div><div className="diff-document-after"><span className="diff-change-label">{t('after')}</span>{renderBlock(block.after || '', toRef)}</div></section>;
  })}</div>;
}

type SplitCellKind = 'context' | 'added' | 'removed';

interface SplitCell {
  line: number;
  text: string;
  kind: SplitCellKind;
}

type SplitRow = { kind: 'hunk'; label: string } | { kind: 'line'; left?: SplitCell; right?: SplitCell };

interface SplitDiffOptions {
  ignoreSpaces: boolean;
  ignoreTabs: boolean;
  ignoreBlankLines: boolean;
}

export function parseSplitDiff(patch: string): SplitRow[] {
  const lines = patch.replaceAll('\r\n', '\n').split('\n');
  const rows: SplitRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      rows.push({ kind: 'hunk', label: line });
      index += 1;
      continue;
    }
    if (!inHunk) { index += 1; continue; }
    if (line.startsWith(' ')) {
      const text = line.slice(1);
      rows.push({ kind: 'line', left: { line: oldLine++, text, kind: 'context' }, right: { line: newLine++, text, kind: 'context' } });
      index += 1;
      continue;
    }
    if (line.startsWith('-') || line.startsWith('+')) {
      const removed: SplitCell[] = [];
      const added: SplitCell[] = [];
      while (index < lines.length && (lines[index].startsWith('-') || lines[index].startsWith('+') || lines[index].startsWith('\\'))) {
        const changedLine = lines[index];
        if (changedLine.startsWith('-')) removed.push({ line: oldLine++, text: changedLine.slice(1), kind: 'removed' });
        else if (changedLine.startsWith('+')) added.push({ line: newLine++, text: changedLine.slice(1), kind: 'added' });
        index += 1;
      }
      const count = Math.max(removed.length, added.length);
      for (let changedIndex = 0; changedIndex < count; changedIndex += 1) rows.push({ kind: 'line', left: removed[changedIndex], right: added[changedIndex] });
      continue;
    }
    index += 1;
  }
  return rows;
}

function SplitDiff({ diff }: { diff: DiffResult }) {
  const { t } = useI18n();
  const [options, setOptions] = useState<SplitDiffOptions>({ ignoreSpaces: false, ignoreTabs: false, ignoreBlankLines: false });
  if (!diff.patch.trim()) return <div className="empty-view">{diff.message || t('noDiff')}</div>;
  const rows = parseSplitDiff(diff.patch);
  if (!rows.length) return <div className="empty-view">{diff.message || t('noDiffLines')}</div>;
  const comparable = (text: string) => {
    let next = text;
    if (options.ignoreSpaces) next = next.replaceAll(' ', '');
    if (options.ignoreTabs) next = next.replaceAll('\t', '');
    return next;
  };
  const visibleRows: SplitRow[] = [];
  let pendingHunk: SplitRow | undefined;
  for (const row of rows) {
    if (row.kind === 'hunk') { pendingHunk = row; continue; }
    if (row.left?.kind === 'context' && row.right?.kind === 'context') continue;
    const leftText = row.left?.text || '';
    const rightText = row.right?.text || '';
    if (options.ignoreBlankLines && !leftText.trim() && !rightText.trim()) continue;
    if (row.left && row.right && comparable(leftText) === comparable(rightText)) continue;
    if (pendingHunk) { visibleRows.push(pendingHunk); pendingHunk = undefined; }
    visibleRows.push(row);
  }
  const cell = (value: SplitCell | undefined, side: 'left' | 'right') => <div className={`split-diff-cell ${side} ${value?.kind || 'empty'}`}><span className="split-line-number">{value?.line || ''}</span><code>{value?.text || ' '}</code></div>;
  const toggle = (key: keyof SplitDiffOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }));
  return <div className="split-diff-panel"><div className="split-diff-options" aria-label={t('ignoreOptions')}><span>{t('comparisonOptions')}</span><label><input type="checkbox" checked={options.ignoreSpaces} onChange={() => toggle('ignoreSpaces')} />{t('ignoreSpaces')}</label><label><input type="checkbox" checked={options.ignoreTabs} onChange={() => toggle('ignoreTabs')} />{t('ignoreTabs')}</label><label><input type="checkbox" checked={options.ignoreBlankLines} onChange={() => toggle('ignoreBlankLines')} />{t('ignoreBlankLines')}</label></div>{visibleRows.length ? <div className="split-diff"><div className="split-diff-header"><div><span>{t('before')}</span><code>{diff.from.slice(0, 12)}</code></div><div><span>{t('after')}</span><code>{diff.to.slice(0, 12)}</code></div></div><div className="split-diff-body">{visibleRows.map((row, index) => row.kind === 'hunk' ? <div className="split-diff-hunk" key={`${row.label}-${index}`}>{row.label}</div> : <div className="split-diff-row" key={index}>{cell(row.left, 'left')}{cell(row.right, 'right')}</div>)}</div></div> : <div className="empty-view">{t('noVisibleDiff')}</div>}</div>;
}

export function DiffView({ diff, before, after, provider, owner, repository, documentPath, loading, error, historyPath }: { diff: DiffResult | null; before: string | null; after: string | null; provider?: RepositoryProvider; owner: string; repository: string; documentPath: string; loading: boolean; error: string | null; historyPath: string }) {
  const { t } = useI18n();
  const [showSplit, setShowSplit] = useState(false);
  const canRenderDocument = before !== null && after !== null;
  return <section className="diff-view"><div className="view-heading"><div><span className="eyebrow">DOCUMENT DIFF</span><h1>{diff?.path || t('versionComparison')}</h1></div><div className="diff-view-actions">{canRenderDocument && <button className="button button-quiet" type="button" onClick={() => setShowSplit((value) => !value)}>{showSplit ? t('documentComparison') : t('splitDiff')}</button>}<a className="button button-quiet" href={historyPath}>{t('returnHistory')}</a></div></div>{loading && <div className="inline-loading"><div className="spinner" />{t('calculatingDiff')}</div>}{error && <div className="inline-error">{error}</div>}{!loading && !error && diff && <><div className="diff-summary"><span>from <code>{diff.from.slice(0, 12)}</code></span><span>→</span><span>to <code>{diff.to.slice(0, 12)}</code></span></div>{canRenderDocument && !showSplit ? <DocumentComparison before={before} after={after} provider={provider} owner={owner} repository={repository} documentPath={documentPath} fromRef={diff.from} toRef={diff.to} /> : <SplitDiff diff={diff} />}</>}</section>;
}
