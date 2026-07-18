# OpenFX

TypeScript monorepo — Deno × Perry × VitePlus × React × Nitro

## 仓库结构

```text
domains/          独立领域模块
  _shared/        跨 domain 共享工具
  BewlyScript/    BewlyCat userscript 版，聚焦 B 站桌面原站美化
  costing-assistant/ 工程计价助手
  downip/         IPv6 映射/重定向
  e/              Agent 执行框架
  esn/            Edge Storage Node
  finlyzer/       本地优先账单分析器
  freemac/        暂时保留的旧 Mac 仪表盘 & IPv6 relay（见迁移门禁）
  gasmap/         燃气工程单线图工具
  hlc/            圣灯社区 PWA/CMS
  how-much/       商品比价应用
  LivpExplorer/   自托管照片库
  map-poster/     城市地图海报生成器（TypeScript + OSM）
  proxy/          HTTP 中继
  wanone/         编程生涯第一个项目
entry/            入口应用
  desktop/        Perry 原生 OpenFX Node 候选实现（监控、Relay、Agent）
  web/            VitePlus + React + Nitro Web 应用
```

OpenFX 控制台的新 Web 控制面、共享协议和 Perry 节点候选实现位于 `entry/`。当前安装版
Perry 0.5.1220 的原生 HTTP/HTTPS/TLS 客户端不会发起网络 I/O，因此真实配对门尚未通过，
`domains/freemac` 仍是保留运行路径，不能删除。状态、边界和恢复步骤见
[`docs/openfx-console-architecture.md`](docs/openfx-console-architecture.md)。

## 快速开始

前置依赖：[Deno](https://deno.com/)、[Perry](https://docs.perryts.com/)

```bash
deno task web:dev                          # 启动 Web 应用
deno task web:build                        # 生产构建
perry compile entry/desktop/src/main.ts -o dist/openfx-desktop  # 桌面端编译
deno task check                            # 校验（fmt + lint + test + guard）
```

部分 domain 使用独立工具链（如 `domains/BewlyScript/` 用 Bun 构建）。

## Agent 指南

- [AGENTS.md](AGENTS.md) — 仓库全局规范与项目 skill 路由
- [.agents/skills/openfx-repo/](.agents/skills/openfx-repo/) — 项目级 skill
  总入口，负责选择任务 skill 与全局约束
- [.agents/skills/](.agents/skills/) — Web、Nitro、domain 迁移、BewlyScript、Map
  Poster、发布部署等任务 skill

## 协议

Apache-2.0
