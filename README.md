# Git MD Viewer

[English](./README.en.md) · [日本語](./README.ja.md) · 简体中文

Git MD Viewer 是一个面向产品团队的 React 文档查看器。它将 Git 仓库中**指定目录**的 Markdown 变成可浏览、可搜索、可追溯的文档空间；仓库仍是内容与历史的唯一来源，应用只负责读取、组织和渲染。

它适合把产品文档、工程手册、变更记录或团队知识库嵌入到已有 Web 应用，也可作为独立 PWA 使用。

> **发布状态**：当前仓库可直接运行完整的 Vite Viewer，并包含宿主与渲染器的实现参考。`@md-with-git/viewer` 的稳定、可导入的 `DocsViewer` 包入口仍在完善中；在该入口发布前，请将本仓库作为应用或源码集成使用，不要假定 README 中的目标包导入已可用于生产。

## 核心能力

| 领域 | 提供的能力 |
| --- | --- |
| 文档空间 | 以 `scope` 限定 Git 仓库中的文档根目录；不会把整个仓库当作文档站。 |
| 内容浏览 | 自动发现 Markdown，识别 README / index 首页，根据 frontmatter、首个 H1 与文件名生成目录。 |
| Markdown | 支持 GFM、任务列表、表格、frontmatter、相对资源、Mermaid 和 KaTeX。 |
| 数据源 | 支持 GitHub、Bitbucket Cloud、本地文件夹与本地 Git 仓库。 |
| 版本信息 | Provider 协议涵盖分支/标签、文件历史和版本比较。 |
| 搜索 | 依据设备资源自适应地为当前文档空间建立全文索引。 |
| 宿主扩展 | 宿主可显式注册 fenced-code 与 YAML 渲染器；文档内容不能加载或执行组件。 |
| 离线体验 | HTTPS 或 localhost 下可安装为 PWA；Service Worker 只缓存应用壳，不缓存远程仓库响应。 |

## 文档空间模型

一次打开操作对应一个文档空间，而不是整个仓库：

```text
/docs/vitejs/vite/docs/guide?scope=docs%2Fguide
/docs/vitejs/vite/docs/guide/features.md?scope=docs%2Fguide&ref=main
```

`scope` 是文档根目录。目录树、默认首页、搜索与相对链接解析都限制在该范围内；`ref` 可指定分支或标签。这个边界让一个仓库能够承载多套彼此独立的文档。

```text
Git repository
├── docs/guide/          ← scope
│   ├── README.md        ← 默认首页
│   ├── install.md
│   └── advanced/
└── application source   ← 不会出现在 Viewer 目录中
```

## 快速开始：运行内置 Viewer

要求：Node.js 22.14+，以及由 Corepack 或全局安装提供的 pnpm 11。

```bash
corepack enable
pnpm install
pnpm dev
```

打开首页后，可添加 GitHub / Bitbucket 文档空间，或选择本地文件夹、本地 Git 仓库。构建生产静态资源：

```bash
pnpm run build
```

部署时请为 `/` 与 `/docs/*` 配置 SPA 回退，并以 HTTPS 提供 `sw.js`。

## 在宿主应用中二次开发

宿主应用负责路由、登录、主题、错误边界、数据源选择和扩展注册；Git 文档仅提供内容与数据，**不能**决定要执行哪个 React 组件。

推荐边界如下：

```text
Host application
├── product routes / auth / theme / error boundary
├── document-source setup
├── renderer registry             ← 明确允许的扩展
└── Viewer route
    ├── provider reads Git/local content
    ├── markdown parser
    └── registered renderer only  ← never dynamic import / eval
```

仓库中的 [独立宿主示例](./examples/standalone-host/) 展示了目标集成形态。待公共包入口发布后，宿主初始化应类似：

```tsx
import {
  DocsRendererProvider,
  createDocsRendererRegistry,
} from '@md-with-git/viewer';
import { ChangeHistoryRenderer } from './docs-renderers';

const registry = createDocsRendererRegistry();
registry.registerYamlRenderer('change-history', ChangeHistoryRenderer);

const branding = {
  appName: 'Acme 文档中心',
  mark: 'AC',
  document: { icon: { src: '/brand/document-icon.svg', alt: 'Acme' } },
  settings: { image: { src: '/brand/settings-banner.png', alt: 'Acme 文档中心' } },
};

const themeColors = {
  light: { pageBackground: '#f8fafc', surface: '#ffffff', accent: '#2563eb' },
  dark: { pageBackground: '#0f172a', surface: '#172033', text: '#e5eefb', accent: '#60a5fa' },
};

export function App() {
  return (
    <DocsRendererProvider registry={registry} theme="dark" themeColors={themeColors} branding={branding}>
      {/* 在此挂载产品自己的路由与 Viewer 路由 */}
    </DocsRendererProvider>
  );
}
```

`theme` 可选 `light`（默认）或 `dark`，文档顶栏提供亮/暗切换按钮。`themeColors` 可为两种主题分别覆盖
页面背景、表面、文本、边框、强调色、焦点环和代码背景等颜色令牌。`branding.document.icon`（优先）或
`branding.document.image` 用于文档页面顶栏；`branding.settings.image` 显示在来源设置页。每项图片都需要
提供可访问的 `alt` 文本。

在当前版本中，可将内置 `src/main.tsx` 作为宿主起点，或在 monorepo 内直接复用 `src/features/docs/`。不要在未发布的入口出现前，把上面的包导入用于生产构建。

### 扩展 Markdown，而不扩展信任边界

渲染器注册表把 Markdown 声明映射到由宿主编译进应用的 React 组件。它支持：

- YAML fenced block：用名称选择宿主注册的结构化数据视图；
- fenced-code block：按代码语言选择宿主注册的渲染器；
- 返回注销函数，便于按路由、租户或功能开关管理扩展。

核心类型如下：

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

registry.registerYamlRenderer(
  'change-history',
  ChangeHistoryRenderer,
);

registry.registerCodeBlockRenderer('demo', DemoRenderer);
```

例如，文档可以包含一个 `change-history` YAML 块；它只是数据与名称，只有宿主已经注册该名称时才会被渲染为组件。未知名称会回退为普通代码块并显示诊断信息。

````markdown
```yaml renderer=change-history
entries:
  - version: 1.2.0
    date: 2026-08-08
    summary: Local Git support
```
````

扩展组件应把 YAML 当作不可信输入：先进行结构校验，再渲染；不要使用 `eval`、从 Markdown 推导模块路径，或加载远程 JavaScript。

### 新增数据源 Provider

数据源通过 `RepositoryProvider` 抽象。新的 Provider 应实现文件树、文件内容、资源 URL、引用、文件历史与版本比较；随后在宿主的来源配置中显式接入。

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

现有实现可作为参考：[GitHubProvider](./src/features/docs/providers/GitHubProvider.ts)、[BitbucketProvider](./src/features/docs/providers/BitbucketProvider.ts) 与本地 Provider。Provider 层应只读取用户授权的内容，并将令牌、缓存和错误处理与 UI 分离。

## 私有仓库与安全

项目不提供 OAuth，也不要求后端。用户可以在 Viewer 中粘贴自己的访问令牌；令牌以 `Authorization: Bearer <token>` 发送，并只保存在浏览器 `sessionStorage`，按“平台 + owner/workspace + 仓库”隔离。它不会进入 URL、工作区设置或 Service Worker 缓存。

- GitHub：优先使用 Fine-grained PAT，仅授予目标仓库的 **Contents: Read-only**；需要历史时保留 **Metadata** 读取权限。
- Bitbucket Cloud：优先为每个仓库创建只含 **Repositories: Read** 的 Repository access token。
- 令牌仍是浏览器端机密；仅在受信任的设备与站点使用，绝不要提交到源码、`.env` 或截图。

## 项目结构

```text
src/
├── main.tsx                    # 内置宿主应用和路由
├── features/docs/
│   ├── DocsPage.tsx             # 文档空间路由与界面
│   ├── providers/               # GitHub、Bitbucket、local Provider
│   ├── renderers/               # 安全的宿主扩展注册表
│   ├── search.ts                # 当前 scope 的全文搜索
│   └── workspaceSources.ts      # 已保存的文档空间
examples/standalone-host/        # 目标宿主集成示例
tests/fixtures/docs/             # 可公开托管的手工测试夹具
```

## 验证与发布

运行打包前检查：

```bash
pnpm pack --dry-run
```

推送与 `package.json` 版本相同的标签（例如 `v0.1.0`）会触发 [npm 发布工作流](./.github/workflows/publish-npm.yml)。该工作流使用 npm Trusted Publishing（OIDC），无需在 GitHub 保存长期 `NPM_TOKEN`。首次发布需先手动创建 npm 包，之后在 npm 包设置中把 `yougikou/md-with-git` 的 `publish-npm.yml` 配置为 Trusted Publisher。

每个 npm 版本只能发布一次。发布前请确认包导出入口已就绪；当前版本的重点是 Viewer 应用与宿主扩展基础，而不是稳定的库入口。

## 参考

- [产品与架构蓝图](./BLUEPRINT.md)
- [独立宿主示例](./examples/standalone-host/)
- [手工测试说明](./tests/README.md)
