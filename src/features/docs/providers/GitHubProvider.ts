import type {
  AssetQuery, Commit, CompareQuery, DiffResult, FileQuery, HistoryQuery, RepositoryEntry, RepositoryProvider, RepositoryRef, TreeQuery,
} from '../types';
import { getAccessToken } from '../accessTokens';
import { createAssetUrl } from '../assetUrls';

interface GitHubContent {
  type: string;
  path: string;
  sha?: string;
  size?: number;
  content?: string;
  encoding?: string;
  download_url?: string | null;
}

interface GitHubCommit {
  sha: string;
  html_url?: string;
  commit: { message: string; author?: { name?: string; date?: string } };
}

interface GitHubRef {
  name: string;
  commit?: { sha?: string };
}

interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
  token?: string;
}

const metadataCacheTtlMs = 60_000;
const maxRefCacheEntries = 24;
const maxTreeCacheEntries = 16;

export class GitHubProvider implements RepositoryProvider {
  readonly kind = 'github' as const;
  private readonly apiBase = 'https://api.github.com';
  private readonly rawBase = 'https://raw.githubusercontent.com';
  private readonly refsCache = new Map<string, MemoryCacheEntry<RepositoryRef[]>>();
  private readonly treeCache = new Map<string, MemoryCacheEntry<RepositoryEntry[]>>();

  private headers(accept: string): HeadersInit {
    const token = getAccessToken('github');
    return { Accept: accept, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  private async request<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: this.headers('application/vnd.github+json') });
    if (!response.ok) {
      if (response.status === 401) throw new Error('GitHub 访问令牌无效或已过期。请在设置页重新填写令牌。');
      if (response.status === 403) throw new Error('GitHub 拒绝了请求：令牌权限不足，或 API 请求频率已达到限制。');
      if (response.status === 404) throw new Error('仓库、版本或文件不存在；私有仓库请确认令牌已获授权。');
      throw new Error(`GitHub API 请求失败（${response.status}）。`);
    }
    return response.json() as Promise<T>;
  }

  private async requestPage<T>(url: string): Promise<{ value: T; next?: string }> {
    const response = await fetch(url, { headers: this.headers('application/vnd.github+json') });
    if (!response.ok) {
      if (response.status === 401) throw new Error('GitHub 访问令牌无效或已过期。请在设置页重新填写令牌。');
      if (response.status === 403) throw new Error('GitHub 拒绝了请求：令牌权限不足，或 API 请求频率已达到限制。');
      if (response.status === 404) throw new Error('仓库、版本或文件不存在；私有仓库请确认令牌已获授权。');
      throw new Error(`GitHub API 请求失败（${response.status}）。`);
    }
    return { value: await response.json() as T, next: this.nextPage(response.headers.get('link')) };
  }

  private nextPage(linkHeader: string | null): string | undefined {
    if (!linkHeader) return undefined;
    const next = linkHeader.split(',').find((part) => /rel="next"/.test(part));
    const url = next?.match(/<([^>]+)>/)?.[1];
    return url?.startsWith(`${this.apiBase}/`) ? url : undefined;
  }

  private async paged<T>(url: string): Promise<T[]> {
    const values: T[] = [];
    let next: string | undefined = url;
    while (next) {
      const page: { value: T[]; next?: string } = await this.requestPage<T[]>(next);
      values.push(...page.value);
      next = page.next;
    }
    return values;
  }

  private readMetadataCache<T>(cache: Map<string, MemoryCacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    const token = getAccessToken('github');
    if (!entry || entry.expiresAt <= Date.now() || entry.token !== token) {
      cache.delete(key);
      return undefined;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
  }

  private writeMetadataCache<T>(cache: Map<string, MemoryCacheEntry<T>>, key: string, value: T, limit: number): T {
    cache.set(key, { value, expiresAt: Date.now() + metadataCacheTtlMs, token: getAccessToken('github') });
    while (cache.size > limit) cache.delete(cache.keys().next().value as string);
    return value;
  }

  private repo(input: TreeQuery) {
    return `${this.apiBase}/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`;
  }

  private rawUrl(input: FileQuery): string | undefined {
    // A raw URL must include a resolved ref. DocsPage supplies the selected/default
    // ref after loading refs, while callers without one retain the API fallback.
    if (!input.ref) return undefined;
    const path = input.path.split('/').map(encodeURIComponent).join('/');
    return `${this.rawBase}/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/${encodeURIComponent(input.ref)}/${path}`;
  }

  private async rawRequest(input: FileQuery, accept: string): Promise<Response | undefined> {
    const url = this.rawUrl(input);
    if (!url) return undefined;
    try {
      // Do not attach a token to the CDN request. Public content avoids REST API
      // rate limits; private content falls back to the authenticated Contents API.
      const response = await fetch(url, { headers: { Accept: accept } });
      return response.ok ? response : undefined;
    } catch {
      return undefined;
    }
  }

  async getTree(input: TreeQuery): Promise<RepositoryEntry[]> {
    const defaultBranch = input.ref ? input.ref : (await this.request<{ default_branch: string }>(this.repo(input))).default_branch;
    const rootPath = input.rootPath?.replace(/^\/+|\/+$/g, '');
    const cacheKey = `${input.owner}:${input.repository}:${defaultBranch}:${rootPath || ''}`;
    const cached = this.readMetadataCache(this.treeCache, cacheKey);
    if (cached) return cached;
    const data = await this.request<{ tree: Array<{ path: string; type: string; sha?: string; size?: number }>; truncated?: boolean }>(`${this.repo(input)}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`);
    if (data.truncated) console.warn('GitHub tree is truncated; very large repositories may not show every file.');
    const tree = data.tree
      .filter((entry) => !rootPath || entry.path === rootPath || entry.path.startsWith(`${rootPath}/`))
      .map((entry) => ({ path: entry.path, type: entry.type === 'tree' ? 'directory' as const : 'file' as const, sha: entry.sha, size: entry.size }));
    return this.writeMetadataCache(this.treeCache, cacheKey, tree, maxTreeCacheEntries);
  }

  async getRefs(input: TreeQuery): Promise<RepositoryRef[]> {
    const cacheKey = `${input.owner}:${input.repository}`;
    const cached = this.readMetadataCache(this.refsCache, cacheKey);
    if (cached) return cached;
    const [repository, branches, tags] = await Promise.all([
      this.request<{ default_branch?: string }>(this.repo(input)),
      this.paged<GitHubRef>(`${this.repo(input)}/branches?per_page=100`),
      this.paged<GitHubRef>(`${this.repo(input)}/tags?per_page=100`),
    ]);
    const refs = [
      ...branches.map((ref) => ({ name: ref.name, type: 'branch' as const, sha: ref.commit?.sha, isDefault: ref.name === repository.default_branch })),
      ...tags.map((ref) => ({ name: ref.name, type: 'tag' as const, sha: ref.commit?.sha })),
    ];
    return this.writeMetadataCache(this.refsCache, cacheKey, refs, maxRefCacheEntries);
  }

  async getFile(input: FileQuery): Promise<string> {
    const raw = await this.rawRequest(input, 'text/plain');
    if (raw) return raw.text();

    const query = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : '';
    const data = await this.request<GitHubContent>(`${this.repo(input)}/contents/${input.path.split('/').map(encodeURIComponent).join('/')}${query}`);
    if (data.type !== 'file' || !data.content) throw new Error('请求的路径不是可读取的文件。');
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, '')), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async getAssetUrl(input: AssetQuery): Promise<string> {
    const raw = await this.rawRequest(input, 'application/octet-stream');
    if (raw) return createAssetUrl(await raw.blob());

    const query = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : '';
    // Keep the Contents API response JSON-only. This authenticated fallback serves
    // private repositories without mixing a raw media type into the API cache entry.
    const data = await this.request<GitHubContent>(`${this.repo(input)}/contents/${input.path.split('/').map(encodeURIComponent).join('/')}${query}`);
    if (data.type !== 'file' || !data.download_url) throw new Error('请求的路径不是可读取的资源文件。');
    const response = await fetch(data.download_url, { headers: this.headers('application/octet-stream') });
    if (!response.ok) throw new Error(`GitHub 资源读取失败（${response.status}）。`);
    return createAssetUrl(await response.blob());
  }

  async getFileHistory(input: HistoryQuery): Promise<Commit[]> {
    const query = new URLSearchParams({ path: input.path, per_page: String(input.limit || 20) });
    if (input.ref) query.set('sha', input.ref);
    const data = await this.request<GitHubCommit[]>(`${this.repo(input)}/commits?${query}`);
    return data.map((commit) => ({ sha: commit.sha, message: commit.commit.message.split('\n')[0], author: commit.commit.author?.name || 'Unknown', date: commit.commit.author?.date || '', url: commit.html_url }));
  }

  async compare(input: CompareQuery): Promise<DiffResult> {
    const data = await this.request<{ files?: Array<{ filename: string; patch?: string }> }>(`${this.repo(input)}/compare/${encodeURIComponent(input.from)}...${encodeURIComponent(input.to)}`);
    const file = data.files?.find((item) => item.filename === input.path);
    return { from: input.from, to: input.to, path: input.path, patch: file?.patch || '', message: file ? '该文件在此版本比较中没有可显示的文本差异。' : '该文件没有出现在这两个版本的比较结果中，可能是新增、删除或路径不匹配。' };
  }
}
