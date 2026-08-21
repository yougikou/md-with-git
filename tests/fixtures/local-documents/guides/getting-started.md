---
title: 本地文档开始使用
---

# Getting Started Locally

这篇文档用于验证深层路径、GFM 表格、任务列表与相对资源。

![本地流程图](../assets/local-flow.svg)

| 检查项 | 预期 |
| --- | --- |
| 文档树 | 显示 `guides`、`examples` 与当前页 |
| 相对资源 | 显示上方 SVG，而非发起网络请求 |
| 搜索 | 搜索 `本地流程` 能找到本页 |

## ELK 布局测试

以下流程图显式使用 ELK 布局，用于验证本地文档中的 Mermaid 扩展已经加载。

```mermaid
---
config:
  layout: elk
---
flowchart LR
  Reader[Markdown 阅读器] --> Parse[解析文档]
  Parse --> Search[建立搜索索引]
  Parse --> Render[渲染页面]
  Search --> View[文档视图]
  Render --> View
```

- [x] 读取本地 Markdown
- [x] 解析相对图片
- [ ] 不应产生 Git 历史（普通本地文件夹）
