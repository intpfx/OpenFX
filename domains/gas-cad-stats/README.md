# Gas CAD Stats

> 燃气 CAD 图纸工程量提取脚本 · AutoLISP

`gas-cad-stats` 是一个面向 AutoCAD / 兼容 CAD 的辅助工具。它从既有 DWG
图纸中读取实体颜色、文字和块属性，按燃气工程规则汇总管径、类型、数量或长度，并导出 CSV。

这个 domain 保留 CAD 侧运行边界，不属于 GasMap 的 Web/PWA 绘图工作流。

## 文件

```text
domains/gas-cad-stats/
├── README.md
└── gas_pipeline_stats.lsp
```

## 来源

- 本地来源：`/Users/siaovon/Documents/Projects/tempcode/gas_pipeline_stats.lsp`
- 并入时间：2026-06-08
- 并入方式：原样保留 AutoLISP 脚本，只补充 OpenFX 内的使用说明。

## 使用方法

在 AutoCAD / 兼容 CAD 中：

```text
APPLOAD
```

加载 `gas_pipeline_stats.lsp` 后执行：

```text
GASSTAT
```

脚本会优先在图纸所在目录输出：

```text
gas_summary_by_pipe_category.csv
```

如果图纸目录不可写，会自动尝试输出到 CAD 的临时目录。

## 输出格式

CSV 表头固定为：

```text
管径,类型,合计值,备注
```

当前内置规则包括：

- 按实体有效颜色映射管径，支持解析 ByLayer 颜色。
- 大写 `DN` 表示架空钢管，小写 `de` 表示地埋塑料管；历史图纸中的 `dn` / `de`
  会统一输出为 `de`。脚本按最新 RGB 表映射
  `DN50`、`DN40`、`DN32`、`DN25`、`DN15`、`de32`、`de40`、`de63`、`de90`、`de110`。
- `DN` 默认架空时，纯数字文本归类为 `镀锌钢管`，含 `W-` 归类为 `无缝焊接钢管`，含 `Y-`
  归类为 `有缝焊接钢管`。
- `RGB:127,255,223` 的汇总行备注为 `自供材`，`RGB:255,0,0` 的汇总行备注为 `甲供材`。
- `CY` 归类为 `穿越`，`SZ` 归类为 `水钻`。
- `立柱` 单独统计，`合计值` 记录米数，`备注` 记录根数。
- 非 `立柱` 且包含 `*` 的文本按数量类管件聚合。
- 类型末尾的规格后缀会归入管径列，例如 `电熔变径/32`。
- 灰色 `RGB:128,128,128` 明确忽略。

## 边界

- 运行时依赖 CAD 的 AutoLISP / ActiveX 能力，本仓库无法用 Deno 或浏览器直接验证执行。
- 这个脚本面向既有 CAD 图纸反向提取统计；GasMap 面向 Web
  端绘制新工程，两者不共用运行时。
- 后续如需要把 CSV 导入 GasMap，应另建桥接解析流程，不直接把 `.lsp` 放入 GasMap
  前端源码。
