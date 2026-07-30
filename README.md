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
  gasmap/         燃气工程单线图工具
  hlc/            圣灯社区 PWA/CMS
  how-much/       商品比价应用
  LivpExplorer/   自托管照片库
  map-poster/     城市地图海报生成器（TypeScript + OSM）
  proxy/          HTTP 中继
  wanone/         编程生涯第一个项目
entry/            入口应用
  desktop/        Perry 原生 OpenFX Node（文件管理、监控、Relay、Agent）
  web/            VitePlus + React + Nitro Web 应用与 OpenFX 控制台
```

OpenFX 控制台的 Web 控制面、共享协议和 Perry Mac 节点位于 `entry/`。原 Freemac 的遥测、
IPv6、Relay、Agent 和审计能力已经完成切换，旧 Bun/Elysia Core 与独立 Dashboard 已删除。
运行边界、Perry 补丁构建和恢复步骤见
[`docs/openfx-console-architecture.md`](docs/openfx-console-architecture.md)。

## 快速开始

前置依赖：[Deno](https://deno.com/)、[Perry](https://docs.perryts.com/)

```bash
deno task web:dev                          # 启动 Web 应用
deno task web:build                        # 生产构建
deno task perry:runtime --source /path/to/Perry  # 构建补丁版 Perry 原生库
export PERRY_LIB_DIR=/path/to/Perry/target/openfx-v0.5.1220/release
deno task desktop:app                     # 构建并 ad-hoc 签名 arm64 .app
open "dist/OpenFX Node.app"                # 从正式应用包启动节点
deno task desktop:app-smoke               # 验证签名、health、截图和退出
deno task check                            # 校验（fmt + lint + test + guard）
```

`perry:runtime` 要求 Perry 源码位于固定提交且工作区完全干净；它会在输出目录生成带补丁和
产物 SHA-256 的 provenance manifest。`desktop:app` 与两个原生 smoke 都会在使用运行库前
重新校验该 manifest，旧的、缺失的或被改写的运行库不会进入应用包。

部分 domain 使用独立工具链（如 `domains/BewlyScript/` 用 Bun 构建）。

## Agent 指南

- [AGENTS.md](AGENTS.md) — 仓库全局规范与项目 skill 路由
- [.agents/skills/openfx-repo/](.agents/skills/openfx-repo/) — 项目级 skill
  总入口，负责选择任务 skill 与全局约束
- [.agents/skills/](.agents/skills/) — Web、Nitro、domain 迁移、BewlyScript、Map
  Poster、发布部署等任务 skill

## 协议

Apache-2.0
