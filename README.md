# Git MD Viewer

一个可嵌入 React 宿主应用的 Git Markdown Documentation Viewer，当前实现蓝图的 Phase 1 核心能力。

## 开发

```bash
pnpm install
pnpm dev
```

打开 `/docs/:owner/:repository` 浏览公开 GitHub 仓库，例如：

```text
/docs/facebook/react
/docs/facebook/react/README.md?ref=main
```

## 当前能力

- React Router 的 `/docs/*` 路由级动态导入
- GitHub 公共仓库文件树与 Markdown 内容读取
- 自动发现 `.md` / `.mdx`，并隐藏 `_` 开头路径
- README / index 首页识别、目录树与响应式移动端 Sidebar
- frontmatter 标题、首个 H1 标题和文件名的解析
- GFM 表格、任务列表、链接、引用与基础代码块
- Provider 接口预留文件历史、版本比较和资源 URL
- `tests/` 提供可推送到 GitHub 的公开仓库手动测试夹具

项目蓝图见 [BLUEPRINT.md](./BLUEPRINT.md)。

## 手动测试夹具

推送仓库后，可以用下面的路径验证测试内容：

```text
/docs/<GitHub 用户名>/<仓库名>/tests/fixtures/docs/README.md?scope=tests%2Ffixtures%2Fdocs
```

检查项见 [tests/README.md](./tests/README.md)。
