import type {
  AssetQuery, Commit, CompareQuery, DiffResult, FileQuery, HistoryQuery, RepositoryEntry, RepositoryProvider, RepositoryRef, TreeQuery,
} from '../types';
import type { LocalFolderSelection } from '../LocalFolderPicker';
import { loadLocalFolderHandles, saveLocalFolderHandles } from '../localPersistence';
import { LocalGitRepository } from './LocalGitRepository';

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
  private ready: Promise<void> = Promise.resolve();
  private gitRepository?: LocalGitRepository;
  private gitDetection?: Promise<LocalGitRepository | undefined>;

  constructor(files: Iterable<LocalFolderSelection>) {
    this.replaceSelections(files);
  }

  replaceSelections(files: Iterable<LocalFolderSelection>) {
    this.files.clear();
    this.gitRepository = undefined;
    this.gitDetection = undefined;
    const selectedFiles = [...files].map((item) => {
      if ('handle' in item) return { handle: item.handle, path: item.path };
      if ('file' in item) return { file: item.file, path: item.path };
      return { file: item, path: item.webkitRelativePath || item.name };
    });
    const rawPaths = selectedFiles.map((item) => normalizePath(item.path));
    const firstParts = rawPaths.map((path) => path.split('/')[0]);
    const usesNativeHandles = selectedFiles.some((item) => Boolean(item.handle));
    const hasBrowserRelativePaths = selectedFiles.some((item) => Boolean(item.file?.webkitRelativePath));
    const commonRoot = !usesNativeHandles && hasBrowserRelativePaths && firstParts.length > 0 && firstParts.every((part) => part === firstParts[0]) ? `${firstParts[0]}/` : '';
    selectedFiles.forEach((item, index) => {
      const path = commonRoot ? rawPaths[index].slice(commonRoot.length) : rawPaths[index];
      this.files.set(path, { file: item.file, handle: item.handle });
    });
  }

  private async readBytes(path: string): Promise<Uint8Array | null> {
    const file = this.files.get(normalizePath(path));
    if (!file) return null;
    const fileObject = file.file || (file.handle ? await file.handle.getFile() : undefined);
    if (!fileObject) return null;
    return new Uint8Array(await fileObject.arrayBuffer());
  }

  private async getGitRepository(): Promise<LocalGitRepository | undefined> {
    await this.ready;
    if (this.gitRepository) return this.gitRepository;
    if (!this.gitDetection) {
      this.gitDetection = (async () => {
        const candidate = new LocalGitRepository((path) => this.readBytes(path), () => this.files.keys());
        try {
          if (await candidate.isRepository()) {
            this.gitRepository = candidate;
            return candidate;
          }
        } catch {
          // 选择的文件夹不是 Git 仓库时继续使用普通本地文件模式。
        }
        return undefined;
      })();
    }
    return this.gitDetection;
  }

  setReady(ready: Promise<void>) {
    this.ready = ready;
  }

  async getTree(input: TreeQuery): Promise<RepositoryEntry[]> {
    await this.ready;
    const root = normalizePath(input.rootPath || '');
    const gitRepository = await this.getGitRepository();
    if (gitRepository) {
      const paths = await gitRepository.listFiles(input.ref);
      return paths.filter((path) => !root || path === root || path.startsWith(`${root}/`)).map((path) => ({ path, type: 'file' as const }));
    }
    return [...this.files.entries()]
      .filter(([path]) => !root || path === root || path.startsWith(`${root}/`))
      .map(([path, record]) => ({ path, type: 'file' as const, size: record.file?.size }));
  }

  async getRefs(_input: TreeQuery): Promise<RepositoryRef[]> {
    const gitRepository = await this.getGitRepository();
    return gitRepository ? gitRepository.getRefs() : [];
  }

  async getFile(input: FileQuery): Promise<string> {
    await this.ready;
    const gitRepository = await this.getGitRepository();
    if (gitRepository) return new TextDecoder().decode(await gitRepository.readFile(input.path, input.ref));
    const file = this.files.get(normalizePath(input.path));
    if (!file) throw new Error(`本地文件不存在：${input.path}`);
    const fileObject = file.file || (file.handle ? await file.handle.getFile() : undefined);
    if (!fileObject) throw new Error(`无法读取本地文件：${input.path}`);
    return fileObject.text();
  }

  async getAssetUrl(input: AssetQuery): Promise<string> {
    await this.ready;
    const path = normalizePath(input.path);
    const file = this.files.get(path);
    const gitRepository = await this.getGitRepository();
    const cacheKey = `${input.ref || 'HEAD'}:${path}`;
    if (!file && !gitRepository) return '';
    const existing = this.objectUrls.get(cacheKey);
    if (existing) return existing;
    if (gitRepository) {
      try {
        const bytes = await gitRepository.readFile(path, input.ref);
        const blobBytes = new Uint8Array(bytes.byteLength);
        blobBytes.set(bytes);
        const url = URL.createObjectURL(new Blob([blobBytes.buffer]));
        this.objectUrls.set(cacheKey, url);
        return url;
      } catch {
        return '';
      }
    }
    if (!file) return '';
    const fileObject = file.file || (file.handle ? file.handle.getFile() : undefined);
    if (fileObject instanceof Promise) return fileObject.then((value) => {
      const url = URL.createObjectURL(value);
      this.objectUrls.set(cacheKey, url);
      return url;
    });
    if (!fileObject) return '';
    const url = URL.createObjectURL(fileObject);
    this.objectUrls.set(cacheKey, url);
    return url;
  }

  async getFileHistory(input: HistoryQuery): Promise<Commit[]> {
    const gitRepository = await this.getGitRepository();
    if (!gitRepository) return [];
    const commits = await gitRepository.log(input.path, input.ref, input.limit || 20);
    return commits.map((entry) => ({ sha: entry.oid, message: entry.commit.message.split('\n')[0], author: entry.commit.author.name || 'Unknown', date: new Date(entry.commit.author.timestamp * 1000).toISOString() }));
  }

  async compare(input: CompareQuery): Promise<DiffResult> {
    const gitRepository = await this.getGitRepository();
    if (gitRepository) {
      const result = await gitRepository.compare(input.path, input.from, input.to);
      return { from: input.from, to: input.to, path: input.path, ...result };
    }
    return { from: input.from, to: input.to, path: input.path, patch: '', message: '本地文件夹没有 Git 版本历史。' };
  }
}

const localProviders = new Map<string, LocalFolderProvider>();

export function registerLocalFolder(files: Iterable<LocalFolderSelection>): string {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const selection = [...files];
  localProviders.set(id, new LocalFolderProvider(selection));
  void saveLocalFolderHandles(id, selection);
  return id;
}

export function getLocalFolder(id: string | null): LocalFolderProvider | undefined {
  if (!id) return undefined;
  const existing = localProviders.get(id);
  if (existing) return existing;
  const restored = new LocalFolderProvider([]);
  restored.setReady(loadLocalFolderHandles(id).then((selection) => { restored.replaceSelections(selection); }));
  localProviders.set(id, restored);
  return restored;
}
