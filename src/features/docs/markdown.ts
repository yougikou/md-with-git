import type { DocumentFrontmatter, ParsedMarkdown } from './types';

function scalar(value: string): string | number | boolean {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '');
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(normalized)) return Number(normalized);
  return normalized;
}

export function parseFrontmatter(source: string): ParsedMarkdown {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const frontmatter: DocumentFrontmatter = {};
  const content = match ? source.slice(match[0].length) : source;
  if (match) {
    for (const line of match[1].split('\n')) {
      const separator = line.indexOf(':');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      frontmatter[key] = scalar(line.slice(separator + 1));
    }
  }
  const heading = content.match(/^\s*#\s+(.+?)\s*#*\s*$/m)?.[1].trim();
  const title = typeof frontmatter.title === 'string' && frontmatter.title ? frontmatter.title : heading || '未命名文档';
  return { content, frontmatter, title };
}

export function titleFromPath(path: string): string {
  const name = path.split('/').pop()?.replace(/\.(md|mdx)$/i, '') || path;
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isMarkdown(path: string): boolean {
  return /\.(md|mdx)$/i.test(path);
}

export function isIndexFile(path: string): boolean {
  return /(^|\/)README\.md$|(^|\/)index\.md$/i.test(path);
}
