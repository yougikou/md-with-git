# 独立 Viewer 宿主示例

这个目录描述 `@md-with-git/viewer` 发布公共入口后的最小宿主集成形态。当前仓库尚未提供稳定的可导入 `DocsViewer` 包入口，因此这里的包导入与深层导入均为实现目标和 API 参考，不能直接用于生产构建。

宿主应用负责安装 Viewer、配置 Git 文档空间和注入渲染器；Git 文档仓库只提供 Markdown 与 YAML 数据，不提供可执行组件。当前需要二次开发时，请以根目录的 `src/main.tsx` 为宿主起点，或在 monorepo 内直接复用 `src/features/docs/`。

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
