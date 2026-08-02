import { useEffect, useMemo, useState } from 'react';
import type { LocalDirectoryHandle, LocalFolderSelection } from './LocalFolderPicker';
import { readDirectoryLevel } from './LocalFolderPicker';

interface ScopeNode {
  path: string;
  name: string;
  children: ScopeNode[];
  directory?: FileSystemDirectoryHandle;
  loaded: boolean;
  expanded: boolean;
  loading: boolean;
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

function isGitDirectory(path: string): boolean {
  return path.split('/').includes('.git');
}

function nodeFromDirectory(directory: LocalDirectoryHandle): ScopeNode {
  return { path: directory.path, name: directory.name, children: [], directory: directory.directory, loaded: false, expanded: false, loading: false };
}

function buildScopeTree(files: LocalFolderSelection[]): ScopeNode[] {
  const paths = files.map(selectionPath);
  const directories = new Map<string, ScopeNode>();
  for (const item of files) {
    const path = relativePath(item, paths);
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    let parent = '';
    for (const part of parts) {
      const current = parent ? `${parent}/${part}` : part;
      if (!isGitDirectory(current) && !directories.has(current)) directories.set(current, { path: current, name: part, children: [], loaded: true, expanded: false, loading: false });
      parent = current;
    }
  }
  for (const node of directories.values()) {
    const parentPath = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
    const parent = directories.get(parentPath);
    if (parent) parent.children.push(node);
  }
  for (const node of directories.values()) node.children.sort((a, b) => a.path.localeCompare(b.path));
  return [...directories.values()].filter((node) => !node.path.includes('/')).sort((a, b) => a.path.localeCompare(b.path));
}

function updateNode(nodes: ScopeNode[], path: string, update: (node: ScopeNode) => ScopeNode): ScopeNode[] {
  return nodes.map((node) => {
    if (node.path === path) return update(node);
    return { ...node, children: updateNode(node.children, path, update) };
  });
}

function nativeNodes(directories: LocalDirectoryHandle[]): ScopeNode[] {
  return directories.filter((entry) => !isGitDirectory(entry.path)).map(nodeFromDirectory).sort((a, b) => a.path.localeCompare(b.path));
}

function ScopeBranch({ node, value, onChange, onToggle }: { node: ScopeNode; value: string; onChange: (path: string) => void; onToggle: (node: ScopeNode) => void }) {
  return <li><button type="button" className={`scope-tree-option ${value === node.path ? 'selected' : ''}`} onClick={() => { onChange(node.path); onToggle(node); }} disabled={node.loading} aria-busy={node.loading}><span className="scope-tree-toggle">{node.loading ? '…' : node.expanded ? '⌄' : '›'}</span><span className="scope-tree-folder">□</span>{node.name}{node.loading && <span className="scope-tree-loading">正在读取…</span>}</button>{node.expanded && node.children.length > 0 && <ul>{node.children.map((child) => <ScopeBranch key={child.path} node={child} value={value} onChange={onChange} onToggle={onToggle} />)}</ul>}</li>;
}

export function LocalScopeTree({ files, directories, value, onChange }: { files: LocalFolderSelection[]; directories?: LocalDirectoryHandle[]; value: string; onChange: (path: string) => void }) {
  const fallbackNodes = useMemo(() => buildScopeTree(files), [files]);
  const [nativeTree, setNativeTree] = useState<ScopeNode[]>(() => nativeNodes(directories || []));
  const usesLazyTree = Array.isArray(directories);
  const nodes = usesLazyTree ? nativeTree : fallbackNodes;

  useEffect(() => { if (usesLazyTree) setNativeTree(nativeNodes(directories || [])); }, [directories, usesLazyTree]);

  const toggleNode = async (node: ScopeNode) => {
    if (!usesLazyTree || !node.directory || node.loading) return;
    if (node.loaded) {
      setNativeTree((current) => updateNode(current, node.path, (target) => ({ ...target, expanded: !target.expanded })));
      return;
    }
    setNativeTree((current) => updateNode(current, node.path, (target) => ({ ...target, loading: true })));
    try {
      const level = await readDirectoryLevel(node.directory, `${node.path}/`);
      const children = level.directories.filter((entry) => !isGitDirectory(entry.path)).map(nodeFromDirectory).sort((a, b) => a.path.localeCompare(b.path));
      setNativeTree((current) => updateNode(current, node.path, (target) => ({ ...target, children, loaded: true, expanded: true, loading: false })));
    } catch {
      setNativeTree((current) => updateNode(current, node.path, (target) => ({ ...target, loaded: true, loading: false })));
    }
  };

  return <div className="scope-tree" aria-label="选择文档目录"><button type="button" className={`scope-tree-option scope-tree-root ${value === '' ? 'selected' : ''}`} onClick={() => onChange('')}><span className="scope-tree-toggle">·</span><span className="scope-tree-folder">□</span>项目根目录</button>{nodes.length > 0 ? <ul>{nodes.map((node) => <ScopeBranch key={node.path} node={node} value={value} onChange={onChange} onToggle={toggleNode} />)}</ul> : <p className="scope-tree-empty">选择项目根目录后，这里会显示可选目录。</p>}</div>;
}
