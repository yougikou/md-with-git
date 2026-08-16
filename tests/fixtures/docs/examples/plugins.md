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

## Mermaid ELK Layout

下面示例显式使用 ELK 布局。多分支和交叉连线适合用它验证节点排列与连线避让效果。

Example 1
```mermaid
---
config:
  layout: elk
  elk:
    mergeEdges: false
    nodePlacementStrategy: BRANDES_KOEPF
---
flowchart LR
  Input[Markdown 输入] --> Parse[解析文档]
  Parse --> Render[渲染页面]
  Parse --> Index[建立搜索索引]
  Render --> Cache[缓存结果]
  Index --> Cache
  Cache --> View[文档视图]
  Render --> View
```

Example 2
```mermaid
---
config:
  layout: elk
  elk:
    mergeEdges: true
    nodePlacementStrategy: BRANDES_KOEPF
    cycleBreakingStrategy: GREEDY
---
flowchart LR
    %% 样式定义（模拟 C4 风格视觉）
    classDef person fill:#08427b,stroke:#073b6f,color:#ffffff,stroke-width:2px;
    classDef internal fill:#1168bd,stroke:#0b4884,color:#ffffff,stroke-width:2px;
    classDef external fill:#666666,stroke:#4d4d4d,color:#ffffff,stroke-width:2px;

    %% 终端用户
    customer["fa:fa-user <b>终端用户</b><br/><i>[Person]</i><br/>使用 App/小程序/Web 选购与下单"]:::person

    %% 内部核心系统
    subgraph CoreBoundary ["核心业务域"]
        core["<b>核心电商系统</b><br/><i>[Software System]</i><br/>处理交易、订单状态、营销结算"]:::internal
    end

    %% 上游数据源系统
    subgraph Upstream ["上游基础支撑系统"]
        uc["<b>用户中心</b><br/><i>[External System]</i><br/>管理会员、鉴权及优惠券"]:::external
        pc["<b>商品中心</b><br/><i>[External System]</i><br/>管理商品 SKU、价格及库存"]:::external
    end

    %% 下游履约与分析系统
    subgraph Downstream ["下游履约与分析系统"]
        wms["<b>物流系统 (WMS)</b><br/><i>[External System]</i><br/>仓储打单、分拣与包裹发货"]:::external
        bigdata["<b>大数据报表平台</b><br/><i>[External System]</i><br/>全域经营数据分析与数仓"]:::external
    end

    %% 外部第三方通道
    subgraph ThirdParty ["外部合作渠道"]
        pay["<b>第三方支付网关</b><br/><i>[External System]</i><br/>微信/支付宝扣款与退款"]:::external
    end

    %% 数据交互流向与协议标注
    customer -->|浏览选购、下单支付<br/>HTTPS / App| core
    uc -->|获取用户信息与优惠券<br/>RESTful API / RPC| core
    pc -->|广播最新商品详情及库存<br/>MQ 消息队列| core
    core -->|发起支付申请<br/>RESTful API| pay
    pay -->|异步回调支付结果<br/>Webhook / HTTPS| core
    core -->|推送已支付订单数据<br/>RESTful API| wms
    core -->|定时同步流水日志<br/>T+1 ETL / File| bigdata
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
