import type {
  AssetQuery, Commit, CompareQuery, DiffResult, FileQuery, HistoryQuery, RepositoryEntry, RepositoryProvider, RepositoryRef, TreeQuery,
} from '../types';

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

export class LocalFolderProvider implements RepositoryProvider {
  readonly kind = 'local' as const;
  private readonly files = new Map<string, File>();
  private readonly objectUrls = new Map<string, string>();

  constructor(files: Iterable<File>) {
    const selectedFiles = [...files];
    const rawPaths = selectedFiles.map((file) => normalizePath(file.webkitRelativePath || file.name));
    const firstParts = rawPaths.map((path) => path.split('/')[0]);
    const commonRoot = firstParts.length > 0 && firstParts.every((part) => part === firstParts[0]) ? `${firstParts[0]}/` : '';
    selectedFiles.forEach((file, index) => {
      const path = commonRoot ? rawPaths[index].slice(commonRoot.length) : rawPaths[index];
      this.files.set(path, file);
    });
  }

  async getTree(input: TreeQuery): Promise<RepositoryEntry[]> {
    const root = normalizePath(input.rootPath || '');
    return [...this.files.entries()]
      .filter(([path]) => !root || path === root || path.startsWith(`${root}/`))
      .map(([path, file]) => ({ path, type: 'file' as const, size: file.size }));
  }

  async getRefs(_input: TreeQuery): Promise<RepositoryRef[]> {
    return [{ name: 'local', type: 'branch', isDefault: true }];
  }

  async getFile(input: FileQuery): Promise<string> {
    const file = this.files.get(normalizePath(input.path));
    if (!file) throw new Error(`本地文件不存在：${input.path}`);
    return file.text();
  }

  getAssetUrl(input: AssetQuery): string {
    const path = normalizePath(input.path);
    const file = this.files.get(path);
    if (!file) return '';
    const existing = this.objectUrls.get(path);
    if (existing) return existing;
    const url = URL.createObjectURL(file);
    this.objectUrls.set(path, url);
    return url;
  }

  async getFileHistory(_input: HistoryQuery): Promise<Commit[]> {
    return [];
  }

  async compare(input: CompareQuery): Promise<DiffResult> {
    return { from: input.from, to: input.to, path: input.path, patch: '本地文件夹没有 Git 版本历史。' };
  }
}

const localProviders = new Map<string, LocalFolderProvider>();

export function registerLocalFolder(files: Iterable<File>): string {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localProviders.set(id, new LocalFolderProvider(files));
  return id;
}

export function getLocalFolder(id: string | null): LocalFolderProvider | undefined {
  return id ? localProviders.get(id) : undefined;
}
