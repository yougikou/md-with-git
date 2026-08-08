import { isIndexFile, isMarkdown, titleFromPath } from './markdown';
import type { DocumentNode, RepositoryEntry, SectionNode, TreeNode } from './types';

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'document' ? -1 : 1;
    return a.title.localeCompare(b.title, 'zh-CN', { numeric: true });
  });
}

export function buildDocumentTree(entries: RepositoryEntry[], rootPath = ''): TreeNode[] {
  const normalizedRoot = rootPath.replace(/^\/+|\/+$/g, '');
  const paths = entries
    .filter((entry) => entry.type === 'file' && isMarkdown(entry.path) && !entry.path.split('/').some((part) => part.startsWith('_')))
    .map((entry) => entry.path)
    .filter((path) => !normalizedRoot || path.startsWith(`${normalizedRoot}/`));
  const root: SectionNode = { kind: 'section', path: '', title: '', children: [] };
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));

  for (const fullPath of paths) {
    const relativePath = normalizedRoot ? fullPath.slice(normalizedRoot.length + 1) : fullPath;
    const parts = relativePath.split('/');
    const file = parts.pop()!;
    let current = root;
    parts.forEach((part, index) => {
      const sectionPath = parts.slice(0, index + 1).join('/');
      let section = current.children.find((node): node is SectionNode => node.kind === 'section' && node.path === sectionPath);
      if (!section) {
        section = { kind: 'section', path: sectionPath, title: titleFromPath(part), children: [] };
        current.children.push(section);
      }
      current = section;
    });
    const entry = entriesByPath.get(fullPath);
    const document: DocumentNode = { kind: 'document', path: fullPath, title: titleFromPath(file), isIndex: isIndexFile(fullPath), size: entry?.size };
    current.children.push(document);
  }

  const normalize = (node: SectionNode): TreeNode[] => sortNodes(node.children.map((child) => child.kind === 'section' ? { ...child, children: normalize(child) } : child));
  return normalize(root);
}

export function findFirstDocument(nodes: TreeNode[]): DocumentNode | undefined {
  for (const node of nodes) {
    if (node.kind === 'document' && node.isIndex) return node;
    if (node.kind === 'section') {
      const found = findFirstDocument(node.children);
      if (found) return found;
    }
  }
  return nodes.find((node): node is DocumentNode => node.kind === 'document') || undefined;
}

export function findDocument(nodes: TreeNode[], path: string): DocumentNode | undefined {
  for (const node of nodes) {
    if (node.kind === 'document' && node.path === path) return node;
    if (node.kind === 'section') {
      const found = findDocument(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}
