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
/docs/project/guide/install/history
```

版本差异：

```text
/docs/project/guide/install/diff?from=abc123&to=def456
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

实现说明：

- Bitbucket Cloud 通过 `source=bitbucket` 选择，`owner` 对应 workspace，`repository` 对应 repo slug。
- 本地文件夹通过首页或文档页顶栏的目录选择入口载入，文件只在浏览器内读取，不上传到服务器；支持的浏览器
  优先使用 File System Access API，不支持时回退到 `webkitdirectory`，拖拽入口留作增强。
- 本地模式只保存用户授权目录中的文件句柄，按需读取当前 Markdown 或资源文件；本地来源不写入
  IndexedDB Markdown 缓存。
- `scope` 仍然是文档空间根目录，Provider 的文件树和渲染路由不会越过该边界。

进入条件：Phase 1 的 GitHub 公共仓库手动验收通过，并完成 `tests/` 中的测试夹具检查。

### Phase 3：源码与组件

- 外部代码块
- 行号和高亮
- 文件 Tab
- React Island
- iframe Demo

### Phase 4：版本功能

- Commit 历史
- 指定版本浏览
- 文件历史
- Unified Diff
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
Phase 2 多数据源           已实现，待 Bitbucket/本地公开手动验收
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

测试清单与预期结果见 `tests/README.md`。每完成一部分功能，应先更新本节状态与测试结果，
再继续下一个 Phase。
