import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ImgHTMLAttributes } from 'react';
import { resolveAssetPath } from './markdown';
import type { DiffResult, RepositoryProvider } from './types';

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
  const [resolvedSrc, setResolvedSrc] = useState(src);
  useEffect(() => {
    let cancelled = false;
    if (!src || /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('#')) { setResolvedSrc(src); return () => { cancelled = true; }; }
    const assetPath = resolveAssetPath(documentPath, src);
    Promise.resolve(provider.getAssetUrl({ owner, repository, path: assetPath, ref: assetRef })).then((url) => { if (!cancelled) setResolvedSrc(url || src); });
    return () => { cancelled = true; };
  }, [assetRef, documentPath, owner, provider, repository, src]);
  return <img {...props} src={resolvedSrc} alt={alt || ''} />;
}

function MarkdownBlock({ content, provider, owner, repository, documentPath, assetRef }: { content: string; provider?: RepositoryProvider; owner: string; repository: string; documentPath: string; assetRef: string }) {
  return <div className="markdown-body diff-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ src, alt, ...props }) => provider ? <ComparisonMarkdownImage src={src} alt={alt} provider={provider} owner={owner} repository={repository} documentPath={documentPath} assetRef={assetRef} {...props} /> : <img src={src} alt={alt || ''} {...props} /> }}>{content}</ReactMarkdown></div>;
}

function DocumentComparison({ before, after, provider, owner, repository, documentPath, fromRef, toRef }: { before: string; after: string; provider?: RepositoryProvider; owner: string; repository: string; documentPath: string; fromRef: string; toRef: string }) {
  const blocks = compareMarkdownDocuments(before, after);
  if (!blocks.length) return <div className="empty-view">两个版本的 Markdown 内容相同。</div>;
  const renderBlock = (content: string, ref: string) => <MarkdownBlock content={content} provider={provider} owner={owner} repository={repository} documentPath={documentPath} assetRef={ref} />;
  return <div className="diff-document">{blocks.map((block, index) => {
    if (block.kind === 'unchanged') return <section className="diff-document-block unchanged" key={index}>{renderBlock(block.after || '', toRef)}</section>;
    if (block.kind === 'added') return <section className="diff-document-block added" key={index}><span className="diff-change-label">新增</span>{renderBlock(block.after || '', toRef)}</section>;
    if (block.kind === 'removed') return <section className="diff-document-block removed" key={index}><span className="diff-change-label">已删除</span>{renderBlock(block.before || '', fromRef)}</section>;
    return <section className="diff-document-block modified" key={index}><div className="diff-document-before"><span className="diff-change-label">修改前</span>{renderBlock(block.before || '', fromRef)}</div><div className="diff-document-after"><span className="diff-change-label">修改后</span>{renderBlock(block.after || '', toRef)}</div></section>;
  })}</div>;
}

function RawDiff({ diff }: { diff: DiffResult }) {
  return diff.patch.trim() ? <pre className="diff-block">{diff.patch.split('\n').map((line, index) => <span className={`diff-line ${line.startsWith('+') && !line.startsWith('+++') ? 'added' : line.startsWith('-') && !line.startsWith('---') ? 'removed' : line.startsWith('@@') ? 'hunk' : ''}`} key={`${index}-${line}`}>{line || ' '}\n</span>)}</pre> : <div className="empty-view">{diff.message || '这两个版本之间没有可显示的文件差异。'}</div>;
}

export function DiffView({ diff, before, after, provider, owner, repository, documentPath, loading, error, historyPath }: { diff: DiffResult | null; before: string | null; after: string | null; provider?: RepositoryProvider; owner: string; repository: string; documentPath: string; loading: boolean; error: string | null; historyPath: string }) {
  const [showRaw, setShowRaw] = useState(false);
  const canRenderDocument = before !== null && after !== null;
  return <section className="diff-view"><div className="view-heading"><div><span className="eyebrow">DOCUMENT DIFF</span><h1>{diff?.path || '版本比较'}</h1></div><div className="diff-view-actions">{canRenderDocument && <button className="button button-quiet" type="button" onClick={() => setShowRaw((value) => !value)}>{showRaw ? '文档对比' : '原始 Diff'}</button>}<a className="button button-quiet" href={historyPath}>返回历史</a></div></div>{loading && <div className="inline-loading"><div className="spinner" />正在计算版本差异…</div>}{error && <div className="inline-error">{error}</div>}{!loading && !error && diff && <><div className="diff-summary"><span>from <code>{diff.from.slice(0, 12)}</code></span><span>→</span><span>to <code>{diff.to.slice(0, 12)}</code></span></div>{canRenderDocument && !showRaw ? <DocumentComparison before={before} after={after} provider={provider} owner={owner} repository={repository} documentPath={documentPath} fromRef={diff.from} toRef={diff.to} /> : <RawDiff diff={diff} />}</>}</section>;
}
