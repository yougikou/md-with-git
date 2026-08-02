import type {
  AssetQuery, Commit, CompareQuery, DiffResult, FileQuery, HistoryQuery, RepositoryEntry, RepositoryProvider, RepositoryRef, TreeQuery,
} from '../types';
import type { LocalFolderSelection } from '../LocalFolderPicker';

interface LocalFileRecord {
  file?: File;
  handle?: FileSystemFileHandle;
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

export class LocalFolderProvider implements RepositoryProvider {
  readonly kind = 'local' as const;
  private readonly files = new Map<string, LocalFileRecord>();
  private readonly objectUrls = new Map<string, string>();

  constructor(files: Iterable<LocalFolderSelection>) {
    const selectedFiles = [...files].map((item) => {
      if ('handle' in item) return { handle: item.handle, path: item.path };
      if ('file' in item) return { file: item.file, path: item.path };
      return { file: item, path: item.webkitRelativePath || item.name };
    });
    const rawPaths = selectedFiles.map((item) => normalizePath(item.path));
    const firstParts = rawPaths.map((path) => path.split('/')[0]);
    const commonRoot = firstParts.length > 0 && firstParts.every((part) => part === firstParts[0]) ? `${firstParts[0]}/` : '';
    selectedFiles.forEach((item, index) => {
      const path = commonRoot ? rawPaths[index].slice(commonRoot.length) : rawPaths[index];
      this.files.set(path, { file: item.file, handle: item.handle });
    });
  }

  async getTree(input: TreeQuery): Promise<RepositoryEntry[]> {
    const root = normalizePath(input.rootPath || '');
    return [...this.files.entries()]
      .filter(([path]) => !root || path === root || path.startsWith(`${root}/`))
      .map(([path, record]) => ({ path, type: 'file' as const, size: record.file?.size }));
  }

  async getRefs(_input: TreeQuery): Promise<RepositoryRef[]> {
    return [];
  }

  async getFile(input: FileQuery): Promise<string> {
    const file = this.files.get(normalizePath(input.path));
    if (!file) throw new Error(`本地文件不存在：${input.path}`);
    const fileObject = file.file || (file.handle ? await file.handle.getFile() : undefined);
    if (!fileObject) throw new Error(`无法读取本地文件：${input.path}`);
    return fileObject.text();
  }

  async getAssetUrl(input: AssetQuery): Promise<string> {
    const path = normalizePath(input.path);
    const file = this.files.get(path);
    if (!file) return '';
    const existing = this.objectUrls.get(path);
    if (existing) return existing;
    const fileObject = file.file || (file.handle ? file.handle.getFile() : undefined);
    if (fileObject instanceof Promise) return fileObject.then((value) => {
      const url = URL.createObjectURL(value);
      this.objectUrls.set(path, url);
      return url;
    });
    if (!fileObject) return '';
    const url = URL.createObjectURL(fileObject);
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

export function registerLocalFolder(files: Iterable<LocalFolderSelection>): string {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localProviders.set(id, new LocalFolderProvider(files));
  return id;
}

export function getLocalFolder(id: string | null): LocalFolderProvider | undefined {
  return id ? localProviders.get(id) : undefined;
}
