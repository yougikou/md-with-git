# Markdown Git Documentation Viewer 蓝图

## 1. 产品定位

一个基于 React 的前端 Markdown 文档 Viewer，主要用于浏览 GitHub、Bitbucket 等 Git 仓库中的文档，并支持：

- 自动发现 Markdown / MDX 文件
- 自动生成多级 Sidebar
- 浏览器路径路由
- 外部源码引用
- React Application / Demo 嵌入
- Git 版本历史
- Markdown 版本差异对比
- 本地文件夹快捷预览
- 本地 Git 仓库项目根目录与文档 scope 的独立配置

项目不直接 Fork Docsify，而是借鉴 Docsify 的文档体验，构建独立的 React 模块。

## 2. 总体架构

```text
产品宿主 React App
├── 产品级路由与部署
├── /docs/* 路由
│   └── 动态导入 Docs Viewer
├── GitHub Provider
├── Bitbucket Provider
├── Local Folder Provider
├── Document Tree Builder
├── Markdown Pipeline
├── Version History
└── Diff Viewer
```

宿主应用负责产品级路由、权限、全局主题和布局；Docs Viewer 负责文档展示；Provider 负责读取不同来源的文件和 Git 数据。

## 3. 宿主应用集成

Markdown Viewer 通过路由级动态导入实现代码分离：

```tsx
const DocsPage = lazy(() => import('./features/docs/DocsPage'));

<Route
  path="/docs/*"
  element={
    <Suspense fallback={<Loading />}>
      <DocsPage />
    </Suspense>
  }
/>
```

Markdown Viewer 不直接绑定具体路由框架，通过适配器与宿主通信：

```ts
interface DocsRuntime {
  navigate(path: string): void;
  getBasePath(): string;
}
```

Viewer 的一次打开操作对应一个“文档空间”，即一个 Git 仓库中的文档根目录，而不是整个 Git
仓库。路由通过 `scope` 指定文档根目录：

```text
/docs/vitejs/vite/docs/guide?scope=docs/guide
```

Git 仓库只提供文档文件、相对资源和版本数据；Sidebar、默认首页和文档路由都限制在 `scope`
目录内。未指定 `scope` 时，Viewer 应提示调用方补全文档目录。

### 3.1 包分发与简易宿主

Viewer 以 npm 包形式分发。即使用户不在已有产品中集成，也通过一个最小宿主应用提供入口、
Provider 配置和渲染器注册；文档仓库本身不提供可执行组件。

项目内的独立使用示例规划为：

```text
examples/standalone-host/
├── README.md
└── src/
    ├── main.tsx
    └── docs-renderers.tsx
```

示例宿主负责安装并加载 `@md-with-git/viewer`、提供 `DocsRuntime` 和文档来源配置、从
`src/docs-renderers.tsx` 注入用户自己的 YAML 渲染器，以及提供产品级路由、主题和错误边界。

推荐配置形态：

```tsx
import { createDocsRendererRegistry, DocsViewer } from '@md-with-git/viewer';
import { ChangeHistoryRenderer } from './docs-renderers';

const rendererRegistry = createDocsRendererRegistry({
  'change-history': ChangeHistoryRenderer,
});

export function App() {
  return <DocsViewer rendererRegistry={rendererRegistry} />;
}
```

Viewer 核心只提供空的 registry 和 YAML 扩展协议；需要自定义能力时，只修改宿主的
`src/docs-renderers.tsx` 并显式注册，不修改 Git 文档仓库。当前示例中的 `change-history`
完全属于宿主示例，不属于 Viewer 内置能力。

## 4. 数据源 Provider

统一抽象 GitHub、Bitbucket 和本地文件：

```ts
interface RepositoryProvider {
  getTree(input: TreeQuery): Promise<RepositoryEntry[]>;
  getFile(input: FileQuery): Promise<string>;
  getAssetUrl(input: AssetQuery): string;
  getFileHistory(input: HistoryQuery): Promise<Commit[]>;
  compare(input: CompareQuery): Promise<DiffResult>;
}
```

初始实现：

```text
GitHubProvider
BitbucketProvider
LocalFolderProvider
```

未来可扩展 GitLab、Gitea、企业内部 Git 服务。

## 5. 自动生成 Sidebar

不强制使用 Docsify 风格的 `_sidebar.md`。默认规则：

```text
文档根目录的子目录 = 文档空间
直接子目录 = Sidebar 分区
更深层目录 = 可展开树节点
Markdown 文件 = 文档页面
README.md / index.md = 当前目录首页
_ 开头文件 = 默认隐藏
```

示例：

```text
docs/
├── guide/
│   ├── index.md
│   ├── install.md
│   └── advanced/
│       └── plugins.md
└── api/
    └── button.md
```

自动生成：

```text
使用指南
├── 安装
└── 高级
    └── 插件

API
└── Button
```

标题优先级：

```text
frontmatter.title
Markdown 第一个 H1
文件名
目录名
```

可选配置用于修改显示名称、排序、隐藏文件、自定义分区和默认展开状态。

## 6. 前端自动发现流程

```text
进入 /docs/project/docs?scope=docs
  ↓
动态加载 Docs Viewer
  ↓
调用 Git Provider 获取文件树
  ↓
过滤 Markdown / MDX 文件
  ↓
前端构建文档树
  ↓
渲染 Sidebar
  ↓
用户点击文档
  ↓
按路由请求对应 Markdown
```

不依赖后端生成 manifest。前端可以使用 React State、IndexedDB、Cache API 和 Web Worker 做缓存及耗时处理。

缓存 Key：

```text
provider + repository + commit + path
```

## 7. Markdown 渲染管线

```text
Markdown Source
  ↓
Frontmatter 解析
  ↓
自定义语法预处理
  ↓
Markdown AST
  ↓
Remark / Rehype 插件
  ↓
React Renderer
  ↓
页面输出
```

计划支持：

- GFM
- 表格和任务列表
- Mermaid
- 数学公式
- Callout
- Tabs
- 自定义容器
- 外部源码引用
- React Demo
- 代码高亮、复制、行号和高亮行

建议技术：`remark`、`rehype`、`react-markdown` 或 `unified`、`Shiki`、`DOMPurify`。

## 8. 外部代码块

支持类似语法：

````md
```tsx file=src/components/Button.tsx lines=10-40
```
````

或：

```md
:::code
file: src/components/Button.tsx
language: tsx
lines: 10-40
:::
```

代码文件必须根据当前 Git Commit 加载，保证文档与源码版本一致。

## 9. React 应用嵌入

根据安全和复杂度支持三种模式：

```text
受控组件       → React Island
完整 React App  → iframe
用户代码        → 沙箱环境
```

不直接执行来自远程仓库的任意脚本。第一版优先实现 iframe 和受控 React Demo。

## 10. Git 版本功能

指定版本：

```text
/docs/project/guide/install?ref=abc123
```

文件历史：

```text
/docs/project/guide/install.md/history
```

版本差异：

```text
/docs/project/guide/install.md/diff?from=abc123&to=def456
```

支持：

- Commit 历史
- 指定 Commit 浏览
- Branch / Tag / Commit 切换
- 文件历史
- 两个版本比较
- Unified Diff / Split Diff
- 新增、修改、删除、重命名识别
- 忽略空格
- 变更行统计

第一阶段实现原始 Markdown 行级 Diff；后续再考虑渲染后的结构差异。

## 11. 纯前端约束

公开仓库可以完全在浏览器中运行。私有仓库需要处理 OAuth、PKCE、Token 存储、CORS 和 API 限流。

静态部署必须支持 SPA fallback：

```text
/docs/project/guide/start
        ↓
返回 index.html
        ↓
React Router 解析路径
```

如果企业 Git 服务不允许跨域访问，则需要浏览器扩展、桌面端辅助或代理服务；这属于部署约束，不改变核心 Viewer 架构。

## 12. 本地文件模式

本地文件作为附属 Provider：

```text
LocalFolderProvider
├── File System Access API
├── 拖拽文件夹
├── 浏览器端 `.git` 只读解析
└── 可选 localhost 服务
```

本地模式与 Git 模式共用相同的 Provider 接口、Sidebar、路由和 Markdown 渲染器。

## 13. 开发阶段

### Phase 1：核心 Viewer

- [x] React 宿主集成
- [x] `/docs/*` 路由
- [x] 动态导入
- [x] GitHub 公共仓库
- [x] 自动 Markdown Tree
- [x] Sidebar
- [x] Markdown 渲染
- [x] 基础代码块

实现位置：`src/main.tsx`、`src/features/docs/`。

当前实现说明：目录树发现阶段使用路径生成初始标题；打开文档后，正文标题支持
`frontmatter.title` → 第一个 H1 → 文件名的优先级。frontmatter 的 `order` 目前只作为
测试夹具保留，尚未接入目录排序。

### Phase 2：多数据源

- [x] Bitbucket Provider
- [x] 本地文件夹 Provider
- [x] 图片和相对路径资源
- [x] IndexedDB Markdown 缓存
- [x] Branch / Tag 切换
- [x] GitHub / Bitbucket 文档空间配置 UI

实现说明：

- Bitbucket Cloud 通过 `source=bitbucket` 选择，`owner` 对应 workspace，`repository` 对应 repo slug。
- 首页保留独立的“设置在线 Git 仓库”入口，支持 GitHub/Bitbucket、仓库、文档目录和可选版本；文档页顶栏也可切换到该表单。
- 普通本地文档通过首页或文档页顶栏的“本地文档”入口载入，文件只在浏览器内读取，不上传到服务器；支持的浏览器
  优先使用 File System Access API，不支持时回退到 `webkitdirectory`，拖拽入口留作增强。
- 本地 Git 仓库使用独立的“设置本地 Git 仓库”入口：用户先选择 `.git` 所在的项目根目录，再填写相对项目根目录的
  文档 `scope`。Viewer 只将该 scope 作为文档空间，项目根目录的其它 Markdown 不进入 Sidebar 或默认路由。
- 本地 Git 配置会校验项目根目录中的 `.git/HEAD`；普通本地文档不会因为目录中碰巧存在 `.git` 而切换成 Git 配置流程。
- 本地模式只保存用户授权目录中的文件句柄，按需读取当前 Markdown 或资源文件；本地来源不写入
  IndexedDB Markdown 缓存。
- 原生目录选择模式会在 IndexedDB 中保存文件句柄和相对路径，以便刷新页面后恢复只读会话；不保存
  本地文件内容。旧浏览器的文件选择回退模式无法持久化句柄，失效后需要重新选择目录。
- 普通本地文件夹模式显式关闭 Git 解析并不显示 Git VERSION；即使用户选择的普通文件夹碰巧包含 `.git`，也不会切换成 Git 模式。
- 只有本地 Git 专用配置会启用 Git 解析；若该模式无法读取隐藏的 `.git` 文件，则直接提示重新选择 Git 项目根目录。
- 通过本地 Git 专用入口选择仓库根目录且原生 File System Access API 能读取 `.git` 时，`LocalFolderProvider`
  会使用浏览器端 Git 解析器读取 HEAD、Branch、Tag、Commit 历史和版本内容，并复用 History
  与 Diff 接口；只读取对象，不修改或上传本地仓库。目录上传回退模式通常不会提供隐藏的 `.git`
  文件，因此会继续作为普通本地文件夹运行。
- `scope` 仍然是文档空间根目录，Provider 的文件树和渲染路由不会越过该边界；本地 Git 路由缺少 scope 时直接提示配置错误。

进入条件：Phase 1 的 GitHub 公共仓库手动验收通过，并完成 `tests/` 中的测试夹具检查。

### Phase 3：源码与组件

- [ ] 外部代码块
- 行号和高亮
- 文件 Tab
- [x] YAML 代码块渲染器注册接口
- [x] 用户自定义 YAML 数据类型与 React 渲染组件
- [x] 独立使用模式的简易宿主与 `src/docs-renderers.tsx` 配置示例
- React Island
- iframe Demo

#### Phase 3 的 YAML 代码块扩展协议

Phase 3 不把 YAML 仅当作普通代码展示，而是提供一个由简易宿主或产品宿主注册的渲染器接口。
远程 Markdown 只能声明数据类型和数据内容，不能通过 YAML 执行任意 JavaScript；渲染组件必须
来自已安装的 Viewer 包、宿主应用或宿主配置路径，不能来自远程 Git 文档。

渲染器来源按优先级处理：

```text
宿主传入的 rendererRegistry
  ↓
未知 renderer → 原始 YAML 代码块
```

Markdown 约定：

````md
```yaml renderer=change-history
entries:
  - version: 1.4.0
    date: 2026-08-02
    summary: 支持本地文档空间
    breaking: false
```
````

建议接口：

```tsx
interface YamlBlockContext {
  documentPath: string;
  repository: string;
  ref?: string;
  scope: string;
}

interface YamlBlockRendererProps {
  value: unknown;
  context: YamlBlockContext;
}

interface DocsRendererRegistry {
  registerYamlRenderer(
    name: string,
    renderer: React.ComponentType<YamlBlockRendererProps>,
  ): () => void;
}
```

独立使用时，`examples/standalone-host/src/docs-renderers.tsx` 是用户定义渲染器的配置路径；
发布为 npm 包时，该文件属于使用方项目，不会被 Git 文档内容动态加载。

处理流程：

```text
YAML fenced code block
  ↓
读取 renderer 标识
  ↓
安全解析 YAML（不执行脚本）
  ↓
从宿主 DocsRendererRegistry 查找渲染器
  ↓
渲染用户定义的 React 组件
  ↓
未知 renderer 降级为原始 YAML 代码块并显示诊断信息
```

第一批示例/测试类型为 `change-history`，实现位于 `examples/standalone-host/src/docs-renderers.tsx`，
用于以 YAML 记录变更履历并渲染为表格；它不是 Viewer 内置渲染器。后续可扩展 API 状态表、发布
说明、配置矩阵等数据视图。渲染器的注册、注销、类型校验、错误
边界和远程仓库安全策略需要在实现阶段一并确定。实现必须禁止 `eval`、远程 JS 动态导入和
从 Markdown/YAML 推导组件模块路径。

### Phase 4：版本功能

- [x] Commit 历史
- [x] 指定版本浏览
- 文件历史
- [x] Unified Diff
- Split Diff
- 变更文件列表

### Phase 5：高级能力

- 私有仓库 OAuth
- 搜索
- Mermaid
- MDX
- 结构化文档 Diff
- 插件系统
- GitLab / Gitea / 企业 Git 支持

## 14. 推荐技术栈

```text
React
TypeScript
Vite
React Router
remark / rehype
react-markdown 或 unified
Shiki
DOMPurify
IndexedDB
Web Worker
diff / react-diff-viewer
```

## 15. 核心设计原则

```text
宿主应用负责部署和产品路由
Docs Viewer 负责文档体验
Provider 负责 Git 数据源
用户渲染器来自安装包宿主或显式配置路径，不来自文档仓库
前端负责目录发现和内容加载
Commit SHA 负责版本确定性
Markdown Renderer 与数据源解耦
React Demo 默认隔离运行
```

最终产品不是单纯的 Docsify 替代品，而是一个可嵌入 React 产品的 Git Markdown Documentation Viewer。

## 16. 当前进度与测试策略

截至 2026-08-02：

```text
Phase 1 核心 Viewer       已实现
自动化类型检查             已通过：tsc -b
生产构建                   已通过：vite build
GitHub 真实仓库验收        待使用公开仓库路径手动确认
本地 Git 浏览器端回归      已通过：真实含 pack 对象的仓库，refs、文档树与 scope 内 Markdown 均可读取
Phase 2 多数据源           已实现，待 Bitbucket/本地公开手动验收
Phase 3 YAML 渲染器第一批   已实现，待使用 fixtures 浏览器手动验收
```

仓库内的 `tests/` 是可直接推送到 GitHub 的手动测试夹具，不依赖后端或私有数据。推送后，
可以通过下面的路径追加验证：

```text
/docs/<GitHub 用户名>/<仓库名>/tests/fixtures/docs/README.md?scope=tests%2Ffixtures%2Fdocs
```

`scope` 用来指定当前文档空间的根目录。Viewer 不提供无范围的整个仓库浏览；测试夹具带上
`scope=tests%2Ffixtures%2Fdocs` 后，Sidebar、默认首页和后续文档导航都只作用于夹具目录。

Phase 2 的来源与版本测试入口见 `tests/README.md`，包括 GitHub、Bitbucket、本地文件夹、相对
资源和 Branch/Tag 切换。

Phase 3 第一批实现位置：`src/features/docs/renderers/` 只提供 registry、宿主上下文和 YAML
解析协议；`examples/standalone-host/src/docs-renderers.tsx` 提供 `change-history` 示例渲染器。
`src/features/docs/DocsPage.tsx` 只在 YAML fenced block 明确提供 `renderer=<name>` 时解析数据。
未知 renderer 和 YAML 解析错误均保留原始代码并显示诊断，不从 Git 文档加载代码。

Phase 4 第一批实现位置：`src/features/docs/HistoryView.tsx` 展示当前 Markdown 文件的 Commit
历史，`src/features/docs/DiffView.tsx` 展示 GitHub/Bitbucket Provider 返回的 unified patch；
`src/features/docs/versionRoutes.ts` 统一生成历史版本和比较 URL。当前 branch/tag 会先使用 Provider
返回的对应 Commit SHA，保证“当前版本”比较目标稳定。
文档页只提供 History 入口；历史列表中的“查看该历史版本”会切换当前文档的 `ref`，不跳转到
GitHub/Bitbucket 原生网站；“与当前版本比较”以当前查看版本为比较目标。Diff 页面要求显式提供
`from` 和 `to`，本地文件夹会明确提示不包含 Git 历史。

本地 Git 仓库 Provider 实现位于 `src/features/docs/providers/LocalGitRepository.ts`，由
`LocalFolderProvider` 在本地 Git 专用配置完成后检测 `.git/HEAD` 并启用。它支持只读 refs、版本文件读取、文件历史和
基础 unified diff；普通文件夹仍保持无版本历史的行为。首页的本地 Git 设置表单位于 `src/main.tsx`，通过
`localMode=git` 和 `scope` 明确区分本地 Git 文档空间与普通本地文档空间。
浏览器运行时会在加载 Git 解析器前显式提供 `Buffer` 兼容层，避免 Vite 环境将已存在的 loose/pack 对象误判为缺失。
`tests/local-git-browser-server.mjs` 与 `tests/run-local-git-browser-harness.mjs` 提供只读的 Chromium 回归流程；
它会验证 refs、HEAD 文档树和 scope 内 Markdown，不复制、不上传或缓存目标仓库内容。
三类设置入口统一为设置卡片：本地 Markdown 选择后先显示已授权目录名；本地 Git 只选择一次项目根目录，
并从同一批文件生成树状 scope；在线 Git、普通本地文件夹和本地 Git 的设置项都通过
`src/features/docs/setupPersistence.ts` 保存在浏览器 localStorage 中。原生目录句柄仍只保存在 IndexedDB，
不保存文件内容；浏览器不会暴露本地绝对路径，因此界面显示目录名或浏览器提供的相对路径。

测试清单与预期结果见 `tests/README.md`。每完成一部分功能，应先更新本节状态与测试结果，
再继续下一个 Phase。
