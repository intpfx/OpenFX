# OpenFX

TypeScript monorepo — Deno × Perry × VitePlus × React × Nitro

## 仓库结构

```text
domains/          独立领域模块
  _shared/        跨 domain 共享工具
  BewlyScript/    BewlyCat 移动优先 Userscripts
  costing-assistant/ 工程计价助手
  downip/         IPv6 映射/重定向
  e/              Agent 执行框架
  esn/            Edge Storage Node
  finlyzer/       本地优先账单分析器
  freemac/        Mac 仪表盘 & IPv6 relay
  gasmap/         燃气工程单线图工具
  hlc/            圣灯社区 PWA/CMS
  how-much/       商品比价应用
  LivpExplorer/   自托管照片库
  proxy/          HTTP 中继
  wanone/         编程生涯第一个项目
entry/            入口应用
  desktop/        Perry 原生桌面应用
  web/            VitePlus + React + Nitro Web 应用
```

## 快速开始

前置依赖：[Deno](https://deno.com/)、[Perry](https://docs.perryts.com/)

```bash
deno task web:dev                          # 启动 Web 应用
deno task web:build                        # 生产构建
perry compile entry/desktop/src/main.ts -o dist/openfx-desktop  # 桌面端编译
deno task check                            # 校验（fmt + lint + test + guard）
```

部分 domain 使用独立工具链（如 `domains/BewlyScript/` 用 pnpm 构建）。

## Agent 指南

- [AGENTS.md](AGENTS.md) — 仓库全局规范
- [.agents/skills/openfx-repo/](.agents/skills/openfx-repo/) — 项目级 skill 与参考文档

## 协议

Apache-2.0
