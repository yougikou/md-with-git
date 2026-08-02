import type {
  AssetQuery, Commit, CompareQuery, DiffResult, FileQuery, HistoryQuery, RepositoryEntry, RepositoryProvider, RepositoryRef, TreeQuery,
} from '../types';

interface BitbucketPage<T> {
  values: T[];
  next?: string;
}

interface BitbucketSourceEntry {
  path: string;
  type: string;
  size?: number;
  commit?: { hash?: string };
}

interface BitbucketRef {
  name: string;
  target?: { hash?: string };
}

interface BitbucketCommit {
  hash: string;
  message?: string;
  author?: { raw?: string };
  date?: string;
  links?: { html?: { href?: string } };
}

export class BitbucketProvider implements RepositoryProvider {
  readonly kind = 'bitbucket' as const;
  private readonly apiBase = 'https://api.bitbucket.org/2.0';

  private repo(input: TreeQuery) {
    return `${this.apiBase}/repositories/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`;
  }

  private async request<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      if (response.status === 404) throw new Error('Bitbucket 工作区、仓库、版本或文件不存在。');
      if (response.status === 401 || response.status === 403) throw new Error('Bitbucket 资源需要登录或当前凭据没有访问权限。');
      throw new Error(`Bitbucket API 请求失败（${response.status}）。`);
    }
    return response.json() as Promise<T>;
  }

  private async paged<T>(url: string): Promise<T[]> {
    const values: T[] = [];
    let next: string | undefined = url;
    while (next) {
      const page: BitbucketPage<T> = await this.request<BitbucketPage<T>>(next);
      values.push(...page.values);
      next = page.next;
    }
    return values;
  }

  async getTree(input: TreeQuery): Promise<RepositoryEntry[]> {
    const ref = input.ref || 'main';
    const rootPath = input.rootPath ? `${input.rootPath.replace(/^\/+|\/+$/g, '')}/` : '';
    const url = `${this.repo(input)}/src/${encodeURIComponent(ref)}/${rootPath}?max_depth=50&pagelen=100`;
    const entries = await this.paged<BitbucketSourceEntry>(url);
    return entries.map((entry) => ({ path: entry.path.startsWith(rootPath) ? entry.path : `${rootPath}${entry.path}`, type: entry.type === 'commit_directory' ? 'directory' : 'file', sha: entry.commit?.hash, size: entry.size }));
  }

  async getRefs(input: TreeQuery): Promise<RepositoryRef[]> {
    const [repository, branches, tags] = await Promise.all([
      this.request<{ mainbranch?: { name?: string } }>(this.repo(input)),
      this.paged<BitbucketRef>(`${this.repo(input)}/refs/branches?pagelen=100`),
      this.paged<BitbucketRef>(`${this.repo(input)}/refs/tags?pagelen=100`),
    ]);
    return [
      ...branches.map((ref) => ({ name: ref.name, type: 'branch' as const, sha: ref.target?.hash, isDefault: ref.name === repository.mainbranch?.name })),
      ...tags.map((ref) => ({ name: ref.name, type: 'tag' as const, sha: ref.target?.hash })),
    ];
  }

  async getFile(input: FileQuery): Promise<string> {
    const ref = input.ref || 'main';
    const url = `${this.repo(input)}/src/${encodeURIComponent(ref)}/${input.path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, { headers: { Accept: 'text/plain' } });
    if (!response.ok) throw new Error(`Bitbucket 文件读取失败（${response.status}）。`);
    return response.text();
  }

  getAssetUrl(input: AssetQuery): string {
    return `https://bitbucket.org/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/raw/${encodeURIComponent(input.ref || 'main')}/${input.path.split('/').map(encodeURIComponent).join('/')}`;
  }

  async getFileHistory(input: HistoryQuery): Promise<Commit[]> {
    const ref = input.ref || 'main';
    const data = await this.paged<BitbucketCommit>(`${this.repo(input)}/filehistory/${encodeURIComponent(ref)}/${input.path.split('/').map(encodeURIComponent).join('/')}?pagelen=${input.limit || 20}`);
    return data.map((commit) => ({ sha: commit.hash, message: commit.message?.split('\n')[0] || '', author: commit.author?.raw || 'Unknown', date: commit.date || '', url: commit.links?.html?.href }));
  }

  async compare(input: CompareQuery): Promise<DiffResult> {
    const response = await fetch(`${this.repo(input)}/diff/${encodeURIComponent(input.to)}?from=${encodeURIComponent(input.from)}`, { headers: { Accept: 'text/plain' } });
    if (!response.ok) throw new Error(`Bitbucket 版本比较失败（${response.status}）。`);
    return { from: input.from, to: input.to, path: input.path, patch: await response.text() };
  }
}
