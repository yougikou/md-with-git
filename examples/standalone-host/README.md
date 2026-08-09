# 独立 Viewer 宿主示例

这是一个可运行的最小宿主集成 fixture。它固定使用 `react-router-dom@6.28.0`，并从本仓库的打包产物安装 `@md-with-git/viewer`，用于防止 Viewer 再次捆绑第二份 Router。

宿主应用负责路由、配置 Git 文档空间和注入渲染器；Git 文档仓库只提供 Markdown 与 YAML 数据，不提供可执行组件。

先在仓库根目录构建库，再安装并启动 fixture：

```bash
pnpm build:lib
pnpm --dir examples/standalone-host install
pnpm --filter md-with-git-viewer-host-smoke dev
```

在 `http://127.0.0.1:4175/` 打开首页后选择 **Open branded documentation**，应能进入 `/docs/*`，而不是白屏。`/mermaid-smoke` 用于在开发服务器中验证 Mermaid 的 CommonJS 依赖链。

配置入口是 `src/docs-renderers.tsx`。只有宿主显式注册的组件才会被 Viewer 使用，文档中的 `renderer=change-history` 只是一个名称，不会触发动态导入、`eval` 或远程 JavaScript 加载。

```tsx
import { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';
import { DocsRendererProvider, createDocsRendererRegistry } from '@md-with-git/viewer/host';
import '@md-with-git/viewer/styles.css';

const DocsViewer = lazy(() => import('@md-with-git/viewer').then(({ DocsViewer }) => ({ default: DocsViewer })));
const rendererRegistry = createDocsRendererRegistry();

export function App() {
  return <DocsRendererProvider registry={rendererRegistry}><Suspense fallback="Loading…"><Route path="/docs/*" element={<DocsViewer />} /></Suspense></DocsRendererProvider>;
}
```

`DocsViewer` 必须放在宿主现有的 `BrowserRouter`（或等价 Router）内，且路由路径应以 `/*` 结尾。不要为 Viewer 再创建 Router；React、React DOM 与 React Router 都由宿主以 peer dependency 提供。
