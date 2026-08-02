---
title: YAML 变更履历
---

# YAML 变更履历

下面的 fenced block 由宿主注册的 `change-history` 渲染器渲染为表格。默认展示最近 3 个版本，更早版本可以展开。

```yaml renderer=change-history
entries:
  - version: 1.4.0
    date: 2026-08-02
    summary: 支持本地文档空间
    breaking: false
    changes:
      - 使用浏览器目录句柄按需读取文件
      - 刷新后恢复只读会话
  - version: 1.3.0
    date: 2026-07-20
    summary: 增加 Bitbucket 文档来源
    changes:
      - 支持 workspace 和 repository 配置
  - version: 1.2.0
    date: 2026-07-08
    summary: 增加版本选择
    changes:
      - 支持 Branch 和 Tag
  - version: 1.1.0
    date: 2026-06-21
    summary: 完善 Markdown 目录发现
    changes:
      - 自动生成多级 Sidebar
  - version: 1.0.0
    date: 2026-06-01
    summary: 首次发布
    breaking: true
    changes:
      - 提供 GitHub Markdown Viewer
```

未知 renderer 的降级测试：

```yaml renderer=not-installed
kind: example
message: 这段数据应保留为原始 YAML，并显示未注册诊断。
```
