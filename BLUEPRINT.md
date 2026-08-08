# Markdown Git Documentation Viewer 蓝图

## 1. 产品定位

一个基于 React 的前端 Markdown 文档 Viewer，主要用于浏览 GitHub、Bitbucket 等 Git 仓库中的文档，并支持：

- 自动发现 Markdown 文件
- 自动生成多级 Sidebar
- 浏览器路径路由
- 多文档源工作区与 Sidebar 来源切换
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
过滤 Markdown 文件
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

- [x] GFM
- [x] 表格和任务列表
- [x] Mermaid（严格安全模式、按需加载）
- [x] 数学公式（KaTeX，行内与块级）
- Callout
- Tabs
- 自定义容器
- React Demo

建议技术：`remark`、`rehype`、`react-markdown` 或 `unified`、`DOMPurify`。

## 8. 多文档源工作区与切换器

“多数据源 Provider”与“一个工作区同时配置多个文档源”是两层能力：Phase 2 已支持不同 Provider
类型；Phase 3 将允许用户把多个本地文件夹、多个本地 Git 仓库、多个在线 Git 仓库混合加入同一
工作区。每个源独立保存 Provider 类型、仓库标识、文档 scope、版本和本地授权句柄。

建议数据模型：

```ts
interface WorkspaceSource {
  id: string;
  label: string;
  kind: 'github' | 'bitbucket' | 'local-folder' | 'local-git';
  owner?: string;
  repository?: string;
  scope?: string;
  ref?: string;
  localId?: string;
}
```

文档浏览界面的 Sidebar 顶部加入来源切换菜单。切换来源时替换当前目录树和文档内容，但保留每个
来源各自最后打开的文档、版本、Sidebar 展开状态和搜索索引。第一批搜索仍限定当前激活来源，不在
后台同时索引所有来源。

设置界面负责添加、移除、重命名和排序来源；在线来源的元数据保存在 localStorage，本地目录句柄
继续保存在 IndexedDB。浏览器权限失效时只要求重新授权对应的本地来源，不影响工作区中的其它来源。
路由必须包含稳定的 `sourceId`，避免不同仓库中同路径文档发生冲突。

## 9. 交互示例嵌入

不直接执行来自远程仓库的任意脚本。iframe Demo 只运行自包含的示例，使用无
`allow-same-origin` 的 sandbox、独立 CSP、默认禁网和显式重新运行/停止控制。运行能力由 Viewer
内置，不要求文档使用者安装工具或配置本地运行环境。

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
- Split Diff（解析 Provider 返回的 unified patch 后左右对齐展示）
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

### Phase 3：多源与交互组件

- [x] 多文档源工作区（混合多个本地文件夹与 Git 仓库）
- [x] Sidebar 顶部来源切换菜单
- [x] 来源增删、重命名、排序与持久化恢复
- [x] 每个来源独立保存路由、版本、目录状态和搜索索引
- [x] YAML 代码块渲染器注册接口
- [x] 用户自定义 YAML 数据类型与 React 渲染组件
- [x] 独立使用模式的简易宿主与 `src/docs-renderers.tsx` 配置示例
- [x] iframe Demo

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
- [x] 文件历史
- [x] Unified Diff 数据解析
- [x] Split Diff 界面（宽屏、仅显示变更行、可忽略空格 / Tab / 空行）

### Phase 5：高级能力

- 私有仓库 OAuth
- [x] 搜索（当前 scope 的前端全文检索）
- [x] Mermaid（严格安全模式、按需加载）
- [x] 结构化文档 Diff 第一批（Markdown block 级）
- [x] 插件系统第一批（fenced-code / YAML 渲染器注册表、KaTeX）

## 14. 推荐技术栈

```text
React
TypeScript
Vite
React Router
remark / rehype
react-markdown 或 unified
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

截至 2026-08-08：

```text
Phase 1 核心 Viewer       已实现
自动化类型检查             已通过：tsc -b
生产构建                   已通过：vite build
GitHub 真实仓库验收        待使用公开仓库路径手动确认
本地 Git 浏览器端回归      已通过：真实含 pack 对象的仓库，refs、文档树与 scope 内 Markdown 均可读取
Phase 2 多数据源           已实现，待 Bitbucket/本地公开手动验收
Phase 3 YAML 渲染器第一批   已实现，待使用 fixtures 浏览器手动验收
Phase 3 多文档源与交互组件   已实现：来源工作区、状态恢复、隔离 iframe Demo
Phase 4 文件历史与 Diff     已实现：历史版本浏览、Split Diff、Markdown block 级结构化对比
Phase 5 自适应全文搜索      已实现：Worker、设备分档、降级、版本隔离缓存、实时预览
Phase 5 零配置插件第一批    已实现：Mermaid、KaTeX、fenced-code/YAML 渲染器注册表
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

Phase 3 第一批实现位置：`src/features/docs/renderers/` 提供 registry、宿主上下文、YAML 数据渲染器与
fenced-code 渲染器协议；`examples/standalone-host/src/docs-renderers.tsx` 提供 `change-history` 示例渲染器。
`src/features/docs/DocsPage.tsx` 只在 YAML fenced block 明确提供 `renderer=<name>` 时解析数据。
未知 renderer 和 YAML 解析错误均保留原始代码并显示诊断，不从 Git 文档加载代码。

Phase 3 剩余部分实现位置：`src/features/docs/workspaceSources.ts` 在浏览器本地保存多个在线仓库、
本地文件夹和本地 Git 来源，以及各来源最后路由与 Sidebar 展开状态。来源的添加、重命名、排序和
删除统一放在设置页；Sidebar 顶部只显示当前来源标题，点击后通过弹出菜单切换其他来源。
`IframeDemoRenderer.tsx` 默认不执行示例，用户点击运行后才以 `sandbox="allow-scripts"`、无同源权限、
禁止网络连接的 CSP 在 iframe 中运行自包含 HTML，不要求文档仓库或用户电脑安装额外运行时。

Phase 4 第一批实现位置：`src/features/docs/HistoryView.tsx` 展示当前 Markdown 文件的 Commit
历史，`src/features/docs/DiffView.tsx` 将 GitHub/Bitbucket Provider 返回的 unified patch 解析为左右
对齐的 Split Diff；
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
并从同一批文件生成树状 scope。原生 File System Access API 模式下，选择阶段只读取项目根目录第一层，
scope 树默认收起，用户展开目录时再按层读取；点击打开文档空间时才递归读取 scope 所需的完整文件，并在
读取期间显示加载状态。在线 Git、普通本地文件夹和本地 Git 的设置项都通过
`src/features/docs/setupPersistence.ts` 保存在浏览器 localStorage 中。原生目录句柄仍只保存在 IndexedDB，
不保存文件内容；浏览器不会暴露本地绝对路径，因此界面显示目录名或浏览器提供的相对路径。

测试清单与预期结果见 `tests/README.md`。每完成一部分功能，应先更新本节状态与测试结果，
再继续下一个 Phase。

Phase 5 第一批实现位置：`src/features/docs/search.ts` 负责搜索模型，`search.worker.ts` 在独立线程完成
Markdown 纯文本规范化、查询、排序和摘要生成。`DocsPage` 根据 `deviceMemory` 与 CPU 核心数选择低资源、
平衡或完整模式，分别使用 1/2/4 个读取并发、4/12/32 MB 正文预算以及 150/500/1000 篇正文上限；
超出单文件或总预算的页面仍会索引标题和路径。页面进入后台时暂停继续读取，查询限制为相关度最高的
30 条结果。在线索引按 Provider、仓库、Commit、scope 和设备档位缓存于 IndexedDB；本地文件索引仅
存在于当前 Worker，会话结束后不保留。切换仓库、scope 或版本会载入对应缓存或重新建立索引，搜索
请求不会发送给第三方搜索服务。

Phase 5 插件第一批以“零用户配置、浏览器内执行、内容仓库不能注入代码”为边界。宿主通过
`DocsRendererRegistry.registerCodeBlockRenderer()` 注册 fenced-code 渲染器，文档只用语言标识选择
已经随应用安装的组件。内置 `mermaid` 渲染器动态加载 Mermaid，固定使用严格安全模式并限制文本与
边数量；KaTeX 通过 `remark-math` / `rehype-katex` 支持 `$...$` 与 `$$...$$`。两者均随应用构建，
不依赖 CDN、外部渲染服务、CLI、系统软件或仓库级设置。

后续零配置插件推荐顺序：原生 admonition/tabs、严格 JSON/YAML schema 的 ECharts、Markmap。
继续禁止 `eval`、文档内 JavaScript、远程模块导入和可执行回调；图表数据只能是
声明式数据。PlantUML 等默认依赖服务器或本机 Java 的方案不进入内置插件范围。

## 17. 稳定化迭代与待审查功能建议

### 第一轮质量护栏（2026-08-08）

这一轮不修改应用运行逻辑、不改变数据模型或现有交互。目标是让既有能力更容易验证、回归和记录问题：

- `pnpm check`：执行 TypeScript 类型检查与测试夹具契约检查；
- `pnpm test:fixtures`：确认关键 fixture 文件和 Markdown/GFM、相对资源、YAML renderer、Mermaid、KaTeX、iframe demo 标记仍然存在；
- `pnpm test:github-provider`：模拟 GitHub 响应，验证资源读取不会与 Markdown 的 JSON API 响应共用 raw media type；
- GitHub Pages 与 npm 发布工作流在构建前执行 `pnpm check`；
- `BUGS.md` 统一记录可复现问题、严重度和对应回归覆盖。

真实浏览器的本地 Git 回归仍使用 `tests/local-git-browser-server.mjs` 与
`tests/run-local-git-browser-harness.mjs`，因为它依赖本机 Chrome 和含 `.git` 的真实测试仓库；
暂不强制放入云端 CI，避免环境差异制造假失败。

### 第二轮：已确认缺陷的最小修复（2026-08-08）

发布站点画面巡检发现：GitHub 文档空间完成全文索引后，点击部分搜索结果可能将 Markdown
原文当作 GitHub API JSON 解析。根因是资源读取与正文读取复用了同一个 GitHub Contents API URL，
但前者请求 raw media type、后者请求 JSON；浏览器缓存可能返回错误的媒体类型。

修复仅调整 GitHub Provider 的资源读取路径：先以 JSON 读取文件元数据，再从独立的下载 URL 获取
资源 Blob。它不改变 Markdown、搜索、来源设置或 UI 行为。发布后必须按 BUG-20260808-001 的步骤复测。

### 本地来源全功能巡检样例（2026-08-08）

`tests/fixtures/local-documents` 是可选择的普通本地文件夹 fixture，覆盖深层路径、相对资源、GFM、
Mermaid、KaTeX 和 YAML 安全降级。`tests/create-local-git-fixture.mjs` 会在系统临时目录生成带两个
Commit 的本地 Git 仓库，用于验证 ref、正文、History 和 Diff。`pnpm test:local-git` 在有 Chrome 的
开发机上运行真实 Chromium 回归；它不加入云端 CI，因为目录访问与浏览器安装路径属于机器环境。
普通本地文件夹的 Provider 行为由 `pnpm test:local-folder` 离线覆盖，浏览器原生目录授权窗口则保留为
`tests/README.md` 中的人工巡检步骤。

### 已实施的稳定性与体验改进

以下项目已完成实现，并应作为后续回归检查范围：

| 项目 | 已实现内容 | 回归重点 |
| --- | --- | --- |
| 来源连接诊断 / 重试 | 已保存的来源可执行连接诊断，读取 refs 与文档树并展示成功或错误结果；失败时可重试 | 令牌仅由既有会话存储读取，诊断结果不得回显令牌或敏感响应内容；本地目录授权失效应给出重新选择提示 |
| 可访问性与键盘导航 | 增加可见焦点样式；移动端 Sidebar 打开后获取焦点，支持 Escape、关闭按钮和遮罩关闭；搜索框提供 combobox/listbox 语义，支持方向键进入结果与 Escape 清空 | 回归移动端菜单的焦点返回、屏幕阅读器语义和搜索结果的键盘选择 |
| PWA 新版本提示与可控刷新 | 检测到 waiting Service Worker 时提示“立即更新”或“稍后”；仅在用户确认更新后才跳过 waiting 并刷新页面 | 更新不得自动中断本地目录授权、未完成索引或当前阅读；延后后保持当前版本可继续使用 |

### 待审查功能建议

| 建议 | 预期收益 | 可能影响 / 审查重点 |
| --- | --- | --- |
| 启用 frontmatter 的 `order` 作为同级文档排序依据 | 让导航顺序可由文档维护者明确控制 | 现有按路径排序的 Sidebar 顺序会改变；需定义缺省值和重名规则 |
| 审查 Mermaid 相关分包的体积与加载时机 | 当前生产构建提示最大 Mermaid 分包约 691 kB，优化可改善首次按需渲染图表时的下载体验 | 保持“仅使用 Mermaid 时才加载”与严格安全模式；不得仅通过调高 Vite 警戒线掩盖问题 |

上述建议必须经过审查后才可排入实现；在获批前，稳定化工作只修复已确认缺陷或增强非运行时质量护栏。
