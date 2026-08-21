---
title: 本地渲染器测试
---

# Local Renderer Fixtures

## Mermaid

```mermaid
---
config:
  layout: elk
---
flowchart LR
  Folder[本地文件夹] --> Viewer[Git MD Viewer]
  Viewer --> Document[Markdown 文档]
```

## Math

本地文档也应支持行内公式 $a^2 + b^2 = c^2$。

## YAML

```yaml renderer=not-installed
kind: local-fixture
message: 未注册渲染器应安全降级为原始 YAML。
```
## iframe Demo

```demo title="本地计数器"
<button id="counter">点击次数：0</button>
<script>
  let count = 0;
  document.querySelector('#counter').addEventListener('click', (event) => {
    count += 1;
    event.currentTarget.textContent = `点击次数：${count}`;
  });
</script>
```
