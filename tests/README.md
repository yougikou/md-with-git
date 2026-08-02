# Git MD Viewer 手动测试夹具

这个目录用于验证 GitHub Provider、自动目录树、路由和 Markdown/GFM 渲染结果。
它是普通仓库内容，可以随项目一起推送到 GitHub，不需要测试服务器或额外数据库。

## GitHub 路径

将仓库推送到 GitHub 后，把 `<owner>` 和 `<repository>` 替换为实际值：

```text
/docs/<owner>/<repository>/tests/fixtures/docs/README.md?scope=tests%2Ffixtures%2Fdocs
```

也可以直接打开其他夹具：

```text
/docs/<owner>/<repository>/tests/fixtures/docs/guide/install.md?scope=tests%2Ffixtures%2Fdocs
/docs/<owner>/<repository>/tests/fixtures/docs/guide/advanced/plugins.md?scope=tests%2Ffixtures%2Fdocs
/docs/<owner>/<repository>/tests/fixtures/docs/api/button.md?scope=tests%2Ffixtures%2Fdocs
/docs/<owner>/<repository>/tests/fixtures/docs/examples/change-history.md?scope=tests%2Ffixtures%2Fdocs
/docs/<owner>/<repository>/tests/fixtures/docs/guide/install.md/history?scope=tests%2Ffixtures%2Fdocs
```

Bitbucket Cloud 的文档空间使用 `source=bitbucket`，其中 `<owner>` 对应 workspace：

```text
/docs/<workspace>/<repository>/docs?source=bitbucket&scope=docs
```

本地测试：在首页或文档页顶栏选择本地文件夹，选择 `tests/fixtures/docs` 目录后，Viewer 会按需只读该文件夹，不上传、不复制整目录，也不会将本地 Markdown 写入 IndexedDB。
浏览器应弹出文件夹选择器；如果浏览器不支持原生目录选择，则使用目录上传兼容模式。

## 验收清单

- [ ] 进入测试首页后，左侧 Sidebar 只显示 `tests/fixtures/docs` 下的 `guide`、`api` 和 `examples` 分区，不显示仓库其它目录。
- [ ] `README.md` 能作为测试目录首页读取，并显示 frontmatter 标题。
- [ ] `guide/install.md` 能通过深层路径打开，URL 中的斜杠不会丢失。
- [ ] `guide/advanced/plugins.md` 能显示多级展开树。
- [ ] `api/button.md` 的表格、任务列表和代码块正常渲染。
- [ ] `examples/markdown.md` 的引用、链接、列表和 GFM 内容正常渲染。
- [ ] `examples/assets.md` 能显示相对路径 SVG 图片。
- [ ] `_ignored.md` 不应出现在 Sidebar 中。
- [ ] 首页或文档页顶栏的本地文件夹入口能读取选中的 fixtures，而不是访问服务器。
- [ ] 使用原生文件夹选择器后刷新页面，本地文档空间可以恢复；恢复内容仍是只读句柄，不是文件副本。
- [ ] Bitbucket URL 使用 `source=bitbucket` 后能读取公开仓库文档空间。
- [ ] VERSION 选择器能切换 GitHub/Bitbucket 的 branch 或 tag。
- [ ] 本地文档空间不显示 Git VERSION 选择器或版本徽标。
- [ ] 首页 Git 文档空间表单能填写 GitHub/Bitbucket、仓库和 `scope` 并打开文档。
- [ ] 从本地文档页点击“打开 Git 仓库”后可以切换到 Git 文档空间。
- [ ] `examples/change-history.md` 的 `yaml renderer=change-history` 显示为变更履历表格，默认显示最近 3 个版本。
- [ ] 变更履历中第 4 个及更早版本默认收起，点击“查看更早的变更”后可展开。
- [ ] `renderer=not-installed` 保留原始 YAML，并显示“未注册 YAML 渲染器”诊断。
- [ ] YAML 解析失败时保留原始代码并显示解析错误，不执行文档中的 JavaScript。
- [ ] GitHub/Bitbucket 文档页显示 `History` 和 `Diff` 入口。
- [ ] `.../guide/install.md/history?scope=tests%2Ffixtures%2Fdocs` 能显示文件 Commit 历史；每条历史包含作者、日期、短 SHA 和提交链接（Provider 返回时）。
- [ ] 历史列表中的“与上一个版本比较”能打开 Diff 页面，并显示 from/to SHA 与 unified patch。
- [ ] 直接打开 Diff 但缺少 `from` 或 `to` 时显示明确的参数提示，不发起无效请求。
- [ ] 本地文件夹打开 History 时显示本地模式不包含 Git 历史的提示。

Phase 2 的代码级验证已通过：`tsc -b` 与 `vite build`。上面的 Provider 访问项需要在浏览器中
使用公开仓库或本地文件夹完成验收后再勾选。

Phase 3 第一批的代码级验证已通过：`tsc -b` 与 `vite build`。YAML 渲染器和独立宿主入口还需要
按上面的测试夹具完成浏览器手动验收。

Phase 3 第一批的代码级验证已通过：`tsc -b` 与 `vite build`。YAML 渲染器和独立宿主入口还需要
按上面的测试夹具完成浏览器手动验收。
- [ ] 移动端宽度下可通过菜单打开和关闭 Sidebar。
- [ ] 添加 `?ref=<branch-or-commit>` 后，页面仍能从指定 Git 版本读取。

## 预期限制

当前 Phase 1 的 Sidebar 标题按路径生成；文档正文标题会按
`frontmatter.title` → 第一个 H1 → 文件名解析。frontmatter 的 `order` 字段暂时只用于
确认数据可被读取，排序能力留到后续实现。
