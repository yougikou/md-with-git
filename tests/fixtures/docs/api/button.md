---
title: Button API 测试
---

# Button Fixture

## Props

| 属性 | 类型 | 默认值 |
| --- | --- | --- |
| `label` | `string` | `Button` |
| `disabled` | `boolean` | `false` |

## Checklist

- [x] 支持 GFM 表格
- [x] 支持任务列表
- [ ] 后续加入组件 Demo

```tsx
export function Button({ label = 'Button' }: { label?: string }) {
  return <button>{label}</button>;
}
```
