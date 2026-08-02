import { getBrowserGit } from './isomorphicGitBrowser';
import type { RepositoryRef } from '../types';

type ReadLocalFile = (path: string) => Promise<Uint8Array | null>;
type ListLocalFiles = () => Iterable<string>;

interface LocalStat {
  isFile: () => boolean;
  isDirectory: () => boolean;
}

function normalize(path: string | null | undefined): string {
  return (path || '').replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function missingPath(path: string): Error & { code: 'ENOENT' } {
  const error = new Error(`本地 Git 路径不存在：${path}`) as Error & { code: 'ENOENT' };
  error.code = 'ENOENT';
  return error;
}

function oidFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface GitTreeEntry {
  mode: string;
  path: string;
  oid: string;
}

function lineList(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split('\n');
}

function createPatch(path: string, before: string, after: string): string {
  if (before === after) return '';
  const oldLines = lineList(before);
  const newLines = lineList(after);
  const oldCount = before ? oldLines.length : 0;
  const newCount = after ? newLines.length : 0;
  return [`--- a/${path}`, `+++ b/${path}`, `@@ -1,${oldCount} +1,${newCount} @@`, ...oldLines.map((line) => `-${line}`), ...newLines.map((line) => `+${line}`)].join('\n');
}

export class LocalGitRepository {
  private readonly dir = '/local-repository';
  private readonly gitdir = '/local-repository/.git';
  private readonly fs;
  private lastReadFailure?: string;

  constructor(private readonly readLocalFile: ReadLocalFile, private readonly listLocalFiles: ListLocalFiles) {
    const readFile = async (path: string, options?: { encoding?: string } | string) => {
      const relativePath = this.relativePath(path);
      let bytes: Uint8Array | null;
      try {
        bytes = await this.readLocalFile(relativePath);
      } catch (reason) {
        this.lastReadFailure = `${relativePath}（${reason instanceof Error ? reason.message : String(reason)}）`;
        throw reason;
      }
      if (!bytes) {
        this.lastReadFailure = relativePath;
        throw missingPath(relativePath);
      }
      if (typeof options === 'string' || options?.encoding) return decode(bytes);
      return bytes;
    };
    const stat = async (path: string): Promise<LocalStat> => {
      const relative = this.relativePath(path);
      if (!relative) return { isFile: () => false, isDirectory: () => true };
      const files = [...this.listLocalFiles()].map(normalize);
      if (files.includes(relative)) return { isFile: () => true, isDirectory: () => false };
      if (files.some((file) => file.startsWith(`${relative}/`))) return { isFile: () => false, isDirectory: () => true };
      throw missingPath(relative);
    };
    const readdir = async (path: string): Promise<string[]> => {
      const relative = this.relativePath(path);
      const prefix = relative ? `${relative}/` : '';
      const names = new Set<string>();
      for (const file of this.listLocalFiles()) {
        const normalized = normalize(file);
        if (!normalized.startsWith(prefix)) continue;
        const remainder = normalized.slice(prefix.length);
        const name = remainder.split('/')[0];
        if (name) names.add(name);
      }
      return [...names];
    };
    const readOnly = async () => { throw new Error('本地 Git Provider 是只读的。'); };
    this.fs = { promises: { readFile, readdir, stat, lstat: stat, readlink: readOnly, writeFile: readOnly, unlink: readOnly, mkdir: readOnly, rmdir: readOnly, symlink: readOnly } };
  }

  private relativePath(path: string | null | undefined): string {
    const normalized = normalize(path);
    const prefix = normalize(this.dir) + '/';
    return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  }

  private options() {
    return { fs: this.fs, dir: this.dir, gitdir: this.gitdir };
  }

  async isRepository(): Promise<boolean> {
    const head = await this.readLocalFile('.git/HEAD');
    return Boolean(head && (decode(head).startsWith('ref: ') || /^[0-9a-f]{40}$/i.test(decode(head).trim())));
  }

  private async resolve(ref = 'HEAD'): Promise<string> {
    const git = await getBrowserGit();
    const oid = await git.resolveRef({ ...this.options(), ref });
    if (typeof oid !== 'string' || !oid) throw new Error(`无法解析本地 Git 引用：${ref}`);
    return oid;
  }

  private async readObject(oid: string): Promise<{ type: string; object: Uint8Array }> {
    const git = await getBrowserGit();
    const result = await git.readObject({ ...this.options(), oid, format: 'content' });
    return { type: result.type, object: new Uint8Array(result.object as Uint8Array) };
  }

  private async treeOidForRef(ref: string): Promise<string> {
    let oid = await this.resolve(ref);
    for (let depth = 0; depth < 8; depth += 1) {
      const { type, object } = await this.readObject(oid);
      if (type === 'tree') return oid;
      const source = decode(object);
      if (type === 'tag') {
        const target = source.match(/^object ([0-9a-f]{40})$/m)?.[1];
        if (!target) throw new Error(`无法解析本地 Git Tag 对象：${oid}`);
        oid = target;
        continue;
      }
      if (type === 'commit') {
        const tree = source.match(/^tree ([0-9a-f]{40})$/m)?.[1];
        if (!tree) throw new Error(`无法解析本地 Git Commit 的 tree：${oid}`);
        return tree;
      }
      throw new Error(`本地 Git 引用 ${ref} 未指向 Commit 或 Tree。`);
    }
    throw new Error(`本地 Git Tag 引用层级过深：${ref}`);
  }

  private async readTreeEntries(oid: string): Promise<GitTreeEntry[]> {
    const { type, object } = await this.readObject(oid);
    if (type !== 'tree') throw new Error(`本地 Git 对象不是 Tree：${oid}`);
    const entries: GitTreeEntry[] = [];
    let offset = 0;
    while (offset < object.length) {
      const modeEnd = object.indexOf(0x20, offset);
      const pathEnd = object.indexOf(0, modeEnd + 1);
      const oidStart = pathEnd + 1;
      const oidEnd = oidStart + 20;
      if (modeEnd < 0 || pathEnd < 0 || oidEnd > object.length) throw new Error(`无法解析本地 Git Tree：${oid}`);
      entries.push({ mode: decode(object.slice(offset, modeEnd)), path: decode(object.slice(modeEnd + 1, pathEnd)), oid: oidFromBytes(object.slice(oidStart, oidEnd)) });
      offset = oidEnd;
    }
    return entries;
  }

  async getRefs(): Promise<RepositoryRef[]> {
    const git = await getBrowserGit();
    const options = this.options();
    const branchNames = await git.listBranches(options);
    const tagNames = await git.listTags(options);
    const currentBranch = await git.currentBranch({ ...options, fullname: false });
    const refs: RepositoryRef[] = [];
    for (const name of branchNames) refs.push({ name, type: 'branch', sha: await this.resolve(`refs/heads/${name}`), isDefault: name === currentBranch });
    for (const name of tagNames) refs.push({ name, type: 'tag', sha: await this.resolve(`refs/tags/${name}`) });
    if (!refs.some((ref) => ref.isDefault)) {
      refs.unshift({ name: 'HEAD', type: 'branch' as const, sha: await this.resolve('HEAD'), isDefault: true });
    }
    return refs;
  }

  async listFiles(ref?: string): Promise<string[]> {
    this.lastReadFailure = undefined;
    const files: string[] = [];
    const visit = async (treeOid: string, prefix = ''): Promise<void> => {
      const entries = await this.readTreeEntries(treeOid);
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.path}` : entry.path;
        if (entry.mode === '40000') await visit(entry.oid, path);
        else files.push(path);
      }
    };
    try {
      await visit(await this.treeOidForRef(ref || 'HEAD'));
    } catch (reason) {
      const detail = this.lastReadFailure ? `；无法读取 ${this.lastReadFailure}` : '';
      throw new Error(`${reason instanceof Error ? reason.message : String(reason)}${detail}`);
    }
    return files;
  }

  async readFile(path: string, ref?: string): Promise<Uint8Array> {
    this.lastReadFailure = undefined;
    const parts = normalize(path).split('/').filter(Boolean);
    let treeOid = await this.treeOidForRef(ref || 'HEAD');
    for (let index = 0; index < parts.length; index += 1) {
      const entry = (await this.readTreeEntries(treeOid)).find((candidate) => candidate.path === parts[index]);
      if (!entry) throw new Error(`本地 Git 文件不存在：${normalize(path)}`);
      if (index === parts.length - 1) {
        const { type, object } = await this.readObject(entry.oid);
        if (type !== 'blob') throw new Error(`本地 Git 路径不是文件：${normalize(path)}`);
        return object;
      }
      if (entry.mode !== '40000') throw new Error(`本地 Git 路径不是目录：${parts.slice(0, index + 1).join('/')}`);
      treeOid = entry.oid;
    }
    throw new Error(`本地 Git 文件不存在：${normalize(path)}`);
  }

  async log(path: string, ref?: string, limit = 20) {
    const git = await getBrowserGit();
    return git.log({ ...this.options(), ref: ref || 'HEAD', filepath: normalize(path), depth: limit });
  }

  async compare(path: string, from: string, to: string): Promise<{ patch: string; message?: string }> {
    let before = '';
    let after = '';
    try { before = decode(await this.readFile(path, from)); } catch { /* 文件可能在 from 版本不存在。 */ }
    try { after = decode(await this.readFile(path, to)); } catch { /* 文件可能在 to 版本不存在。 */ }
    const patch = createPatch(normalize(path), before, after);
    return { patch, message: patch ? undefined : '这两个版本之间没有可显示的文件差异。' };
  }
}
