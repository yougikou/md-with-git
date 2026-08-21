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
/docs/<owner>/<repository>/tests/fixtures/docs/examples/plugins.md?scope=tests%2Ffixtures%2Fdocs
/docs/<owner>/<repository>/tests/fixtures/docs/guide/install.md/history?scope=tests%2Ffixtures%2Fdocs
```

Bitbucket Cloud 的文档空间使用 `source=bitbucket`，其中 `<owner>` 对应 workspace：

```text
/docs/<workspace>/<repository>/docs?source=bitbucket&scope=docs
```

本地测试：在首页或文档页顶栏选择本地文件夹，选择 `tests/fixtures/docs` 目录后，Viewer 会按需只读该文件夹，不上传、不复制整目录，也不会将本地 Markdown 写入 IndexedDB。
浏览器应弹出文件夹选择器；如果浏览器不支持原生目录选择，则使用目录上传兼容模式。

本地 Git 测试：从首页进入“设置本地 Git 仓库”，先选择 `.git` 所在的仓库项目根目录，再填写
`tests/fixtures/docs` 作为文档 `scope`。发现 `.git/HEAD` 后，顶栏应出现 VERSION 选择器，并可打开
历史和版本比较。目录上传回退模式不保证包含隐藏的 `.git` 文件，因此只能验证普通本地文件夹模式。

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
- [ ] 使用原生目录选择器选择只包含一个 Markdown 文件的目录时，该文件仍能被发现和打开。
- [ ] 使用原生文件夹选择器后刷新页面，本地文档空间可以恢复；恢复内容仍是只读句柄，不是文件副本。
- [ ] “本地文档”与“设置本地 Git 仓库”是两个独立入口；本地 Git 设置要求分别选择项目根目录和填写 `scope`。
- [ ] 首页和文档页都能进入“设置在线 Git 仓库”，在线 Git 表单仍支持 GitHub/Bitbucket、Repository、文档目录和 Branch/Tag。
- [ ] 本地 Git 设置页面拒绝不包含 `.git/HEAD` 的目录，并明确提示重新选择 Git 项目根目录。
- [ ] 本地 Git 文档页只显示配置的 `scope`，Sidebar 不显示项目根目录下的其它 Markdown。
- [ ] 本地 Git 适配器能读取 HEAD、分支和 scope 内 Markdown；例如选择项目根目录后使用 `tests/fixtures/docs` 作为 scope。
- [ ] 本地 Git 对象位于 `.git/objects/pack` 时，仍能枚举 scope 内的 Markdown 并打开首个文档。
- [ ] Bitbucket URL 使用 `source=bitbucket` 后能读取公开仓库文档空间。
- [ ] VERSION 选择器能切换 GitHub/Bitbucket 的 branch 或 tag。
- [ ] 本地文档空间不显示 Git VERSION 选择器或版本徽标。
- [ ] 首页 Git 文档空间表单能填写 GitHub/Bitbucket、仓库和 `scope` 并打开文档。
- [ ] 本地 Markdown、 本地 Git、在线 Git 三个设置入口都显示统一设置卡片；本地 Markdown 选择后显示已授权目录名，再点击“打开本地文档”。
- [ ] 在线 Git 表单填写后刷新设置页，来源、Owner/Workspace、Repository、文档目录和版本信息仍保留。
- [ ] 本地 Git 只选择一次项目根目录；选择完成后从同一批文件生成树状 scope 目录，`.git` 不出现在文档目录树中。
- [ ] 本地 Git 已选择的目录、scope 在返回设置页或刷新后仍保留；原生目录句柄失效时保留路径并允许重新授权。
- [ ] 选择本地文件夹或本地 Git 根目录时，读取过程显示“正在读取目录…”，完成后才允许继续打开。
- [ ] 本地 Git 初次选择只显示根目录第一层，目录默认收起；展开某个目录时才读取其下一层，并显示“正在读取…”。
- [ ] 点击“打开本地 Git 文档”后显示“正在读取 Git 文件…”，完整读取完成后才创建文档空间。
- [ ] 本地 Markdown、 本地 Git、在线 Git 三个设置入口都显示统一设置卡片；本地 Markdown 选择后显示已授权目录名，再点击“打开本地文档”。
- [ ] 在线 Git 表单填写后刷新设置页，来源、Owner/Workspace、Repository、文档目录和版本信息仍保留。
- [ ] 本地 Git 只选择一次项目根目录；选择完成后从同一批文件生成树状 scope 目录，`.git` 不出现在文档目录树中。
- [ ] 本地 Git 已选择的目录、scope 在返回设置页或刷新后仍保留；原生目录句柄失效时保留路径并允许重新授权。
- [ ] 从本地文档页点击“打开 Git 仓库”后可以切换到 Git 文档空间。
- [ ] `examples/change-history.md` 的 `yaml renderer=change-history` 显示为变更履历表格，默认显示最近 3 个版本。
- [ ] 变更履历中第 4 个及更早版本默认收起，点击“查看更早的变更”后可展开。
- [ ] `renderer=not-installed` 保留原始 YAML，并显示“未注册 YAML 渲染器”诊断。
- [ ] YAML 解析失败时保留原始代码并显示解析错误，不执行文档中的 JavaScript。
- [ ] `examples/plugins.md` 的 Mermaid flowchart 在页面内渲染为 SVG，未使用 Mermaid 的文档不会下载 Mermaid 运行时代码。
- [ ] Mermaid 使用严格安全模式，图表中的 HTML 和点击脚本不能在宿主页面执行；语法错误会保留原始代码并显示诊断。
- [ ] `examples/plugins.md` 的行内与块级数学公式由 KaTeX 渲染，无需页面或仓库配置。
- [ ] 添加多个 GitHub、Bitbucket、本地文件夹和本地 Git 来源后，Sidebar 顶部只显示当前来源标题；点击后弹出其他来源并可切换。
- [ ] 阅读页不显示来源编辑控件；设置页可统一重命名、上移、下移和移除来源，刷新后顺序、名称以及每个来源最后打开的文档、版本与目录展开状态保持不变。
- [ ] 切换来源时只恢复该来源自己的搜索索引；本地目录句柄失效时只提示重新授权该来源，不影响其他来源。
- [ ] iframe Demo 初始不运行，点击“运行”后计数器可用，“停止”和“重新运行”能销毁或重建 iframe 状态。
- [ ] iframe Demo 没有 `allow-same-origin`，网络连接被 CSP 禁止，示例脚本无法读取或修改宿主页面。
- [ ] GitHub/Bitbucket 文档页显示 `History` 入口，正文不显示 `Diff` 按钮。
- [ ] `.../guide/install.md/history?scope=tests%2Ffixtures%2Fdocs` 能显示文件 Commit 历史；每条历史包含作者、日期和短 SHA。
- [ ] 历史列表中的“查看该历史版本”会切换到该 Commit 的文档内容，不跳转到 GitHub/Bitbucket 原生网站。
- [ ] 切换到历史版本后，顶栏 VERSION 显示该 Commit 的短 SHA，刷新后仍能恢复该版本内容。
- [ ] 历史列表中的“与当前版本比较”会以当前查看版本为目标打开 Diff 页面，并显示 from/to SHA 与左右对齐的 Split Diff。
- [ ] Split Diff 的删除行只出现在左栏、新增行只出现在右栏，修改行成对对齐，并分别显示旧、新行号。
- [ ] Split Diff 不显示普通上下文行；切换“忽略空格”“忽略 Tab”“忽略空行”后，对应的纯格式差异立即隐藏。
- [ ] 直接打开 Diff 但缺少 `from` 或 `to` 时显示明确的参数提示，不发起无效请求。
- [ ] 两个版本没有该文件 patch 时显示“没有可显示的文件差异”，而不是把提示文本当作代码差异。
- [ ] 本地文件夹打开 History 时显示本地模式不包含 Git 历史的提示。
- [ ] 选择 Git 仓库根目录后，Local Provider 显示 Branch/Tag/Commit VERSION 选择器。
- [ ] 本地 Git 仓库切换到历史 Commit 后能读取对应 Markdown 内容。
- [ ] 本地 Git 历史页能显示 Commit 历史，并可使用“与当前版本比较”查看本地 unified diff。
- [ ] 进入文档空间后，搜索框先显示全文索引进度；完成后输入 `button`（或 fixture 中正文的词）会立即返回当前 scope 内所有匹配文档，并展示标题、相对路径和正文摘要。
- [ ] 点击搜索结果会打开对应文档并关闭结果面板；按 Escape 会清空搜索。
- [ ] 每条搜索结果显示命中位置附近的多行正文预览；继续输入或删除字符时结果、预览与关键词高亮会立即更新。
- [ ] 搜索索引由独立 Worker 构建；构建期间正文滚动、导航和搜索框输入保持响应，结果最多显示 30 条。
- [ ] 低资源或超大文档空间超过正文预算后显示降级说明；被降级的页面仍能通过标题或路径搜索到。
- [ ] 在线仓库刷新同一 Commit 和 scope 时复用已完成索引；切换 Commit、scope 或设备档位时不会误用旧索引。
- [ ] 页面切换到后台标签页后暂停继续读取索引内容，恢复可见后继续；本地文件索引不会写入 IndexedDB。

Phase 2 的代码级验证已通过：`tsc -b` 与 `vite build`。上面的 Provider 访问项需要在浏览器中
使用公开仓库或本地文件夹完成验收后再勾选。

Phase 3 第一批的代码级验证已通过：`tsc -b` 与 `vite build`。YAML 渲染器和独立宿主入口还需要
按上面的测试夹具完成浏览器手动验收。
- [ ] 移动端宽度下可通过菜单打开和关闭 Sidebar。
- [ ] 添加 `?ref=<branch-or-commit>` 后，页面仍能从指定 Git 版本读取。

## 预期限制

当前 Phase 1 的 Sidebar 标题按路径生成；文档正文标题会按
`frontmatter.title` → 第一个 H1 → 文件名解析。frontmatter 的 `order` 字段暂时只用于
确认数据可被读取，排序能力留到后续实现。
## 本地 Git 浏览器端回归

### 本地文件夹巡检样例

选择 `tests/fixtures/local-documents` 目录，可通过“选择本地文档文件夹”完成不依赖网络的阅读页巡检。
它包含首页、深层 Markdown、相对 SVG、GFM 表格/任务列表、Mermaid、KaTeX 和安全 YAML 降级。
普通本地文件夹不包含 Git 历史，进入 History 时应显示本地模式提示。

### 本地 Git 巡检样例

以下命令会在系统临时目录创建一个全新的只读测试仓库；其中 `docs/` 有两个 Commit，第二次提交会
更新 `guides/getting-started.md` 并添加 CHANGELOG。命令会输出可在设置页选择的仓库根目录与 `scope`：

```powershell
node tests/create-local-git-fixture.mjs
```

在应用中选择输出的仓库根目录，并填写 `docs` 作为 scope。应验证当前文档、版本选择器、文件 History、
历史版本与 Diff；临时目录可在测试完成后由系统清理。

下面的完整命令会启动临时本地服务和 Chromium，自动验证 refs、文档树、正文、两个 Commit 的文件历史和 Diff：

```powershell
node tests/run-local-git-browser-regression.mjs
```

CI 使用 `pnpm test:e2e` 运行 Playwright 回归：它会在浏览器中模拟原生目录句柄，覆盖本地 Git 的设置与阅读流程、全文搜索、移动端目录、History/Diff，以及 GitHub raw 文件读取失败后的 Contents API 回退。首次在开发机运行时可执行 `pnpm exec playwright install chromium`；Windows 开发环境会优先复用已安装的 Chrome。

该工具只读测试仓库的 `.git` 和文档目录；不会复制、写入或缓存用户选择的项目。它用于在真实浏览器中验证本地 Git Provider。

```powershell
node tests/local-git-browser-server.mjs E:\develop\code-prism docs
```

随后访问 `http://localhost:4173/local-git-browser-harness.html`。页面输出 `"ok": true` 表示浏览器端可读取 Git refs、HEAD 文档树与 scope 内的 Markdown 文件。

在无界面 Chromium 中执行同一测试：

```powershell
node tests/run-local-git-browser-harness.mjs
```
