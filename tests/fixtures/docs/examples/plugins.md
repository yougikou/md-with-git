---
title: 零配置插件测试
---

# Zero-config Plugins

## Mermaid

```mermaid
flowchart LR
  Markdown[Git Markdown] --> Registry{代码块插件}
  Registry --> Mermaid[Mermaid 图表]
  Registry --> Custom[宿主自定义插件]
```

## Math

行内公式 $E = mc^2$ 应保持在正文行内。

块级公式：

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

## iframe Demo

示例默认不执行；点击运行后才会进入无同源权限、禁止网络访问的 sandbox iframe。

```demo title="计数器 Demo"
<p>这个计数器只存在于隔离的 iframe 中。</p>
<button id="counter">点击次数：0</button>
<script>
  const button = document.querySelector('#counter');
  let count = 0;
  button.addEventListener('click', () => {
    count += 1;
    button.textContent = `点击次数：${count}`;
  });
</script>
```
