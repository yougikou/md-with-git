import git from 'isomorphic-git';
import type { RepositoryRef } from '../types';

type ReadLocalFile = (path: string) => Promise<Uint8Array | null>;
type ListLocalFiles = () => Iterable<string>;

interface LocalStat {
  isFile: () => boolean;
  isDirectory: () => boolean;
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
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

  constructor(private readonly readLocalFile: ReadLocalFile, private readonly listLocalFiles: ListLocalFiles) {
    const readFile = async (path: string, options?: { encoding?: string } | string) => {
      const bytes = await this.readLocalFile(this.relativePath(path));
      if (!bytes) throw new Error(`本地 Git 文件不存在：${this.relativePath(path)}`);
      if (typeof options === 'string' || options?.encoding) return decode(bytes);
      return bytes;
    };
    const stat = async (path: string): Promise<LocalStat> => {
      const relative = this.relativePath(path);
      const files = [...this.listLocalFiles()].map(normalize);
      if (files.includes(relative)) return { isFile: () => true, isDirectory: () => false };
      if (files.some((file) => file.startsWith(`${relative}/`))) return { isFile: () => false, isDirectory: () => true };
      throw new Error(`本地 Git 路径不存在：${relative}`);
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
    this.fs = { promises: { readFile, readdir, stat, lstat: stat, writeFile: readOnly, unlink: readOnly, mkdir: readOnly, rmdir: readOnly } };
  }

  private relativePath(path: string): string {
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
    return git.resolveRef({ ...this.options(), ref });
  }

  async getRefs(): Promise<RepositoryRef[]> {
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
    return git.listFiles({ ...this.options(), ref: ref || 'HEAD' });
  }

  async readFile(path: string, ref?: string): Promise<Uint8Array> {
    const oid = await this.resolve(ref || 'HEAD');
    const result = await git.readBlob({ ...this.options(), oid, filepath: normalize(path) });
    return result.blob;
  }

  async log(path: string, ref?: string, limit = 20) {
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
