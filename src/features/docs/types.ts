export interface TreeQuery {
  owner: string;
  repository: string;
  ref?: string;
  rootPath?: string;
}

export interface FileQuery extends TreeQuery {
  path: string;
}

export interface AssetQuery extends FileQuery {}

export interface HistoryQuery extends FileQuery {
  limit?: number;
}

export interface CompareQuery extends TreeQuery {
  from: string;
  to: string;
  path: string;
}

export interface RepositoryEntry {
  path: string;
  type: 'file' | 'directory';
  sha?: string;
  size?: number;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url?: string;
}

export interface DiffResult {
  from: string;
  to: string;
  path: string;
  patch: string;
}

export interface RepositoryRef {
  name: string;
  type: 'branch' | 'tag';
  sha?: string;
  isDefault?: boolean;
}

export interface RepositoryProvider {
  readonly kind: 'github' | 'bitbucket' | 'local';
  getTree(input: TreeQuery): Promise<RepositoryEntry[]>;
  getFile(input: FileQuery): Promise<string>;
  getAssetUrl(input: AssetQuery): string | Promise<string>;
  getRefs(input: TreeQuery): Promise<RepositoryRef[]>;
  getFileHistory(input: HistoryQuery): Promise<Commit[]>;
  compare(input: CompareQuery): Promise<DiffResult>;
}

export interface DocumentNode {
  kind: 'document';
  path: string;
  title: string;
  isIndex?: boolean;
}

export interface SectionNode {
  kind: 'section';
  path: string;
  title: string;
  children: TreeNode[];
}

export type TreeNode = DocumentNode | SectionNode;

export interface DocumentFrontmatter {
  title?: string;
  hidden?: boolean;
  order?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface ParsedMarkdown {
  content: string;
  frontmatter: DocumentFrontmatter;
  title: string;
}
