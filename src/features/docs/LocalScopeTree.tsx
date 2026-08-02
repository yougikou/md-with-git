import { useMemo } from 'react';
import type { LocalFolderSelection } from './LocalFolderPicker';

interface ScopeNode {
  path: string;
  name: string;
  children: ScopeNode[];
}

function selectionPath(item: LocalFolderSelection): string {
  if ('handle' in item || 'file' in item) return item.path.replaceAll('\\', '/');
  return (item.webkitRelativePath || item.name).replaceAll('\\', '/');
}

function relativePath(item: LocalFolderSelection, allPaths: string[]): string {
  const path = selectionPath(item);
  const usesBrowserRoot = !('handle' in item) && allPaths.length > 0 && allPaths.every((value) => value.split('/')[0] === path.split('/')[0]);
  return usesBrowserRoot ? path.slice(path.indexOf('/') + 1) : path;
}

function buildScopeTree(files: LocalFolderSelection[]): ScopeNode[] {
  const paths = files.map(selectionPath);
  const directories = new Map<string, ScopeNode>();
  for (const item of files) {
    const path = relativePath(item, paths);
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === '.git') continue;
    parts.pop();
    let parent = '';
    for (const part of parts) {
      const current = parent ? `${parent}/${part}` : part;
      if (!directories.has(current)) directories.set(current, { path: current, name: part, children: [] });
      parent = current;
    }
  }
  for (const node of directories.values()) {
    const parentPath = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
    const parent = directories.get(parentPath);
    if (parent) parent.children.push(node);
  }
  return [...directories.values()]
    .filter((node) => !node.path.includes('/'))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function ScopeBranch({ node, value, onChange }: { node: ScopeNode; value: string; onChange: (path: string) => void }) {
  return <li><button type="button" className={`scope-tree-option ${value === node.path ? 'selected' : ''}`} onClick={() => onChange(node.path)}><span className="scope-tree-folder">□</span>{node.name}</button>{node.children.length > 0 && <ul>{node.children.sort((a, b) => a.path.localeCompare(b.path)).map((child) => <ScopeBranch key={child.path} node={child} value={value} onChange={onChange} />)}</ul>}</li>;
}

export function LocalScopeTree({ files, value, onChange }: { files: LocalFolderSelection[]; value: string; onChange: (path: string) => void }) {
  const nodes = useMemo(() => buildScopeTree(files), [files]);
  return <div className="scope-tree" aria-label="选择文档目录"><button type="button" className={`scope-tree-option scope-tree-root ${value === '' ? 'selected' : ''}`} onClick={() => onChange('')}><span className="scope-tree-folder">□</span>项目根目录</button>{nodes.length > 0 ? <ul>{nodes.map((node) => <ScopeBranch key={node.path} node={node} value={value} onChange={onChange} />)}</ul> : <p className="scope-tree-empty">选择项目根目录后，这里会显示可选目录。</p>}</div>;
}
