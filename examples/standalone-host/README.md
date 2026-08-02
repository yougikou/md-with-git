# 独立 Viewer 宿主示例

这个目录展示发布为 npm 包后的最小使用方式。宿主应用负责安装 Viewer、配置 Git 文档空间和注入渲染器；Git 文档仓库只提供 Markdown 与 YAML 数据，不提供可执行组件。

```bash
pnpm add @md-with-git/viewer react react-dom react-router-dom
```

配置入口是 `src/docs-renderers.tsx`。只有宿主显式注册的组件才会被 Viewer 使用，文档中的 `renderer=change-history` 只是一个名称，不会触发动态导入、`eval` 或远程 JavaScript 加载。

```tsx
import { DocsRendererProvider, createDocsRendererRegistry } from '@md-with-git/viewer';
import { ChangeHistoryRenderer } from './docs-renderers';

const rendererRegistry = createDocsRendererRegistry();
rendererRegistry.registerYamlRenderer('change-history', ChangeHistoryRenderer);

export function App() {
  return <DocsRendererProvider registry={rendererRegistry}>{/* Viewer routes */}</DocsRendererProvider>;
}
```

本仓库的 `src/main.tsx` 就是这个模式的内置宿主实现。发布包补齐 `DocsViewer` 路由级 API 后，可把 `DocsPage` 替换为包导出的 Viewer 组件。
