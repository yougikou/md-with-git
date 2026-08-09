# Git MD Viewer

English · [日本語](./README.ja.md) · [简体中文](./README.md)

Git MD Viewer is a React documentation viewer for product teams. It turns a **selected directory** of Markdown in a Git repository into a browsable, searchable, version-aware documentation space. The repository remains the source of truth for content and history; the viewer only reads, organizes, and renders it.

Use it to embed product documentation, engineering handbooks, release notes, or team knowledge bases in an existing web product, or run it as a standalone PWA.

> **Release status:** `@md-with-git/viewer@0.1.5` provides a stable `DocsViewer` entry, a lightweight host API, and a stylesheet entry. React, React DOM, and React Router are peer dependencies supplied by the host.

> **Host example:** [md-with-git-branded](https://github.com/yougikou/md-with-git-branded) · [Live demo](https://yougikou.github.io/md-with-git-branded/)　|　**Standalone example:** [Live demo](https://yougikou.github.io/md-with-git/)

## What it does

| Area | Capability |
| --- | --- |
| Documentation spaces | Limits a view to a Git directory with `scope`; it never treats the entire repository as a docs site. |
| Browsing | Discovers Markdown, identifies README / index landing pages, and builds navigation from frontmatter, first H1, and filenames. |
| Markdown | Supports GFM, task lists, tables, frontmatter, relative assets, Mermaid, and KaTeX. |
| Sources | GitHub, Bitbucket Cloud, local folders, and local Git repositories. |
| Version data | The provider contract covers branches/tags, file history, and comparisons. |
| Search | Builds an adaptive full-text index for the active documentation space. |
| Host extensions | The host explicitly registers fenced-code and YAML renderers; document content cannot load or execute components. |
| Offline experience | Installable as a PWA on HTTPS or localhost; the Service Worker caches the app shell, never remote repository responses. |

## Documentation-space model

One open operation represents a documentation space, not an entire repository:

```text
/docs/vitejs/vite/docs/guide?scope=docs%2Fguide
/docs/vitejs/vite/docs/guide/features.md?scope=docs%2Fguide&ref=main
```

`scope` is the documentation root. Navigation, landing-page selection, search, and relative-link resolution stay inside it; `ref` selects a branch or tag. A single repository can therefore contain independent documentation spaces.

```text
Git repository
├── docs/guide/          ← scope
│   ├── README.md        ← landing page
│   ├── install.md
│   └── advanced/
└── application source   ← not exposed in the Viewer tree
```

## Quick start: run the built-in Viewer

Requirements: Node.js 22.14+ and pnpm 11, provided through Corepack or a global install.

```bash
corepack enable
pnpm install
pnpm dev
```

From the home page, add a GitHub or Bitbucket documentation space, or select a local folder or local Git repository. Build production assets with:

```bash
pnpm run build
```

Configure SPA fallback for `/` and `/docs/*` when deploying, and serve `sw.js` over HTTPS.

## Build a host application on top of it

The host owns routes, authentication, theme, error boundaries, source selection, and extension registration. Git documentation supplies content and data only; it **cannot** choose a React component to execute.

```text
Host application
├── product routes / auth / theme / error boundary
├── document-source setup
├── renderer registry             ← explicitly allowed extensions
└── Viewer route
    ├── provider reads Git/local content
    ├── markdown parser
    └── registered renderer only  ← never dynamic import / eval
```

The [standalone-host example](./examples/standalone-host/) illustrates the target integration. Once the public package entry is released, initialization should look like this:

```tsx
import {
  DocsRendererProvider,
  createDocsRendererRegistry,
} from '@md-with-git/viewer';
import { ChangeHistoryRenderer } from './docs-renderers';

const registry = createDocsRendererRegistry();
registry.registerYamlRenderer('change-history', ChangeHistoryRenderer);

export function App() {
  return (
    <DocsRendererProvider registry={registry}>
      {/* Mount product routes and the Viewer route here. */}
    </DocsRendererProvider>
  );
}
```

Today, start from the built-in `src/main.tsx` host or reuse `src/features/docs/` directly in a monorepo. Do not use the package import above in a production build before the public entry exists.

### Extend Markdown without expanding the trust boundary

The renderer registry maps Markdown declarations to React components compiled into the host application. It supports:

- YAML fenced blocks selected by a host-registered name;
- fenced-code blocks selected by a host-registered language;
- unregister callbacks for route-, tenant-, or feature-flag-scoped extensions.

```ts
interface YamlBlockRendererProps {
  value: unknown;
  context: {
    documentPath: string;
    repository: string;
    ref?: string;
    scope?: string;
  };
}

registry.registerYamlRenderer('change-history', ChangeHistoryRenderer);
registry.registerCodeBlockRenderer('demo', DemoRenderer);
```

A document may contain a `change-history` YAML block. It is only data and a name; it becomes a component only when the host has registered that name. Unknown names fall back to a normal code block with a diagnostic.

````markdown
```yaml renderer=change-history
entries:
  - version: 1.2.0
    date: 2026-08-08
    summary: Local Git support
```
````

Treat YAML as untrusted input: validate its structure before rendering. Do not use `eval`, infer module paths from Markdown, or load remote JavaScript.

### Add a repository Provider

Sources implement `RepositoryProvider`. A new provider should supply the file tree, file content, asset URLs, refs, file history, and comparisons, then be wired into explicit host source setup.

```ts
interface RepositoryProvider {
  getTree(input: TreeQuery): Promise<RepositoryEntry[]>;
  getFile(input: FileQuery): Promise<string>;
  getAssetUrl(input: AssetQuery): string | Promise<string>;
  getRefs(input: TreeQuery): Promise<RepositoryRef[]>;
  getFileHistory(input: HistoryQuery): Promise<Commit[]>;
  compare(input: CompareQuery): Promise<DiffResult>;
}
```

Use [GitHubProvider](./src/features/docs/providers/GitHubProvider.ts), [BitbucketProvider](./src/features/docs/providers/BitbucketProvider.ts), and the local provider as references. Providers should read only user-authorized content and keep tokens, caching, and error handling separate from the UI.

## Private repositories and security

The project does not implement OAuth and does not require a backend. Users may paste their own access token into the Viewer. It is sent as `Authorization: Bearer <token>`, stored only in browser `sessionStorage`, and partitioned by platform + owner/workspace + repository. It is not written to URLs, workspace settings, or the Service Worker cache.

- GitHub: prefer a fine-grained PAT scoped to the target repository with **Contents: Read-only**; retain **Metadata** read access when history is needed.
- Bitbucket Cloud: prefer one Repository access token per repository with only **Repositories: Read**.
- A token remains a browser-side secret. Use it only on trusted devices and sites; never commit it to source, `.env`, or screenshots.

## Project layout

```text
src/
├── main.tsx                    # built-in host app and routes
├── features/docs/
│   ├── DocsPage.tsx             # documentation-space route and UI
│   ├── providers/               # GitHub, Bitbucket, and local providers
│   ├── renderers/               # safe host extension registry
│   ├── search.ts                # full-text search for the active scope
│   └── workspaceSources.ts      # saved documentation spaces
examples/standalone-host/        # target host-integration example
tests/fixtures/docs/             # manually testable public fixtures
```

## Verify and publish

Inspect the publishable tarball:

```bash
pnpm pack --dry-run
```

Pushing a tag that matches `package.json` (for example, `v0.1.0`) runs the [npm publishing workflow](./.github/workflows/publish-npm.yml). It uses npm Trusted Publishing (OIDC), so no long-lived `NPM_TOKEN` is stored in GitHub. The first npm release must be created manually; then configure `yougikou/md-with-git` and `publish-npm.yml` as the package's Trusted Publisher in npm.

An npm version cannot be overwritten. Before publishing, ensure that package exports are ready: this release focuses on the Viewer application and host-extension foundation, not yet a stable library entry.

## References

- [Product and architecture blueprint](./BLUEPRINT.md)
- [Standalone host example](./examples/standalone-host/)
- [Manual test guide](./tests/README.md)
