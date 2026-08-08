import type {
  AssetQuery, Commit, CompareQuery, DiffResult, FileQuery, HistoryQuery, RepositoryEntry, RepositoryProvider, RepositoryRef, TreeQuery,
} from '../types';
import { getAccessToken } from '../accessTokens';

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

export class GitHubProvider implements RepositoryProvider {
  readonly kind = 'github' as const;
  private readonly apiBase = 'https://api.github.com';

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

  private repo(input: TreeQuery) {
    return `${this.apiBase}/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`;
  }

  async getTree(input: TreeQuery): Promise<RepositoryEntry[]> {
    const defaultBranch = input.ref ? input.ref : (await this.request<{ default_branch: string }>(this.repo(input))).default_branch;
    const data = await this.request<{ tree: Array<{ path: string; type: string; sha?: string; size?: number }>; truncated?: boolean }>(`${this.repo(input)}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`);
    if (data.truncated) console.warn('GitHub tree is truncated; very large repositories may not show every file.');
    const rootPath = input.rootPath?.replace(/^\/+|\/+$/g, '');
    return data.tree
      .filter((entry) => !rootPath || entry.path === rootPath || entry.path.startsWith(`${rootPath}/`))
      .map((entry) => ({ path: entry.path, type: entry.type === 'tree' ? 'directory' : 'file', sha: entry.sha, size: entry.size }));
  }

  async getRefs(input: TreeQuery): Promise<RepositoryRef[]> {
    const [repository, branches, tags] = await Promise.all([
      this.request<{ default_branch?: string }>(this.repo(input)),
      this.request<GitHubRef[]>(`${this.repo(input)}/branches?per_page=100`),
      this.request<GitHubRef[]>(`${this.repo(input)}/tags?per_page=100`),
    ]);
    return [
      ...branches.map((ref) => ({ name: ref.name, type: 'branch' as const, sha: ref.commit?.sha, isDefault: ref.name === repository.default_branch })),
      ...tags.map((ref) => ({ name: ref.name, type: 'tag' as const, sha: ref.commit?.sha })),
    ];
  }

  async getFile(input: FileQuery): Promise<string> {
    const query = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : '';
    const data = await this.request<GitHubContent>(`${this.repo(input)}/contents/${input.path.split('/').map(encodeURIComponent).join('/')}${query}`);
    if (data.type !== 'file' || !data.content) throw new Error('请求的路径不是可读取的文件。');
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, '')), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async getAssetUrl(input: AssetQuery): Promise<string> {
    const query = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : '';
    // Keep the Contents API response JSON-only. Fetching this same endpoint with a raw
    // media type can poison a browser cache entry subsequently used by getFile().
    const data = await this.request<GitHubContent>(`${this.repo(input)}/contents/${input.path.split('/').map(encodeURIComponent).join('/')}${query}`);
    if (data.type !== 'file' || !data.download_url) throw new Error('请求的路径不是可读取的资源文件。');
    const response = await fetch(data.download_url, { headers: this.headers('application/octet-stream') });
    if (!response.ok) throw new Error(`GitHub 资源读取失败（${response.status}）。`);
    return URL.createObjectURL(await response.blob());
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
