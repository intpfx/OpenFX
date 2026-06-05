# 中燃WMS二维码生成器

> Tampermonkey 用户脚本 · v2.1.0 · 2024

## 功能

在指定 WMS 页面自动提取物料信息（供应商名称、物料编码、生产日期、生产批次），
生成可拖拽的悬浮 SVG 二维码，供仓储工作人员手机扫描。

## 技术栈

- 纯原生 JavaScript（ES6+），无框架
- Greasemonkey API（`GM_setValue`、`GM_getValue`、`GM_addStyle`）
- 外部 CDN：Font Awesome 4.7.0、JSR `@libs/qrcode`
- 分发平台：Greasy Fork

## 结构

```text
script.user.js    # 用户脚本本体（678 行）
README.md         # 原始文档
```

## 线上状态

脚本通过 Greasy Fork 分发，已停止更新。功能完整，无需维护。

> 这是你曾经做过的一个实用工具项目。从独立仓库 `chinagas_wms_qrcode` 迁移至 OpenFX
> 作为纪念性 domain 保存。
