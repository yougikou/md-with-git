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
```

Bitbucket Cloud 的文档空间使用 `source=bitbucket`，其中 `<owner>` 对应 workspace：

```text
/docs/<workspace>/<repository>/docs?source=bitbucket&scope=docs
```

本地测试：在首页选择本地文件夹，选择 `tests/fixtures/docs` 目录后，Viewer 会在不上传文件的情况下读取该文件夹。
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
- [ ] Bitbucket URL 使用 `source=bitbucket` 后能读取公开仓库文档空间。
- [ ] VERSION 选择器能切换 GitHub/Bitbucket 的 branch 或 tag。

Phase 2 的代码级验证已通过：`tsc -b` 与 `vite build`。上面的 Provider 访问项需要在浏览器中
使用公开仓库或本地文件夹完成验收后再勾选。
- [ ] 移动端宽度下可通过菜单打开和关闭 Sidebar。
- [ ] 添加 `?ref=<branch-or-commit>` 后，页面仍能从指定 Git 版本读取。

## 预期限制

当前 Phase 1 的 Sidebar 标题按路径生成；文档正文标题会按
`frontmatter.title` → 第一个 H1 → 文件名解析。frontmatter 的 `order` 字段暂时只用于
确认数据可被读取，排序能力留到后续实现。
