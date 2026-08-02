# Git MD Viewer 手动测试夹具

这个目录用于验证 GitHub Provider、自动目录树、路由和 Markdown/GFM 渲染结果。
它是普通仓库内容，可以随项目一起推送到 GitHub，不需要测试服务器或额外数据库。

## GitHub 路径

将仓库推送到 GitHub 后，把 `<owner>` 和 `<repository>` 替换为实际值：

```text
/docs/<owner>/<repository>/tests/fixtures/docs/README.md
```

也可以直接打开其他夹具：

```text
/docs/<owner>/<repository>/tests/fixtures/docs/guide/install.md
/docs/<owner>/<repository>/tests/fixtures/docs/guide/advanced/plugins.md
/docs/<owner>/<repository>/tests/fixtures/docs/api/button.md
```

## 验收清单

- [ ] 进入测试首页后，左侧 Sidebar 能发现 `guide`、`api` 和 `examples` 分区。
- [ ] `README.md` 能作为测试目录首页读取，并显示 frontmatter 标题。
- [ ] `guide/install.md` 能通过深层路径打开，URL 中的斜杠不会丢失。
- [ ] `guide/advanced/plugins.md` 能显示多级展开树。
- [ ] `api/button.md` 的表格、任务列表和代码块正常渲染。
- [ ] `examples/markdown.md` 的引用、链接、列表和 GFM 内容正常渲染。
- [ ] `_ignored.md` 不应出现在 Sidebar 中。
- [ ] 移动端宽度下可通过菜单打开和关闭 Sidebar。
- [ ] 添加 `?ref=<branch-or-commit>` 后，页面仍能从指定 Git 版本读取。

## 预期限制

当前 Phase 1 的 Sidebar 标题按路径生成；文档正文标题会按
`frontmatter.title` → 第一个 H1 → 文件名解析。frontmatter 的 `order` 字段暂时只用于
确认数据可被读取，排序能力留到后续实现。
