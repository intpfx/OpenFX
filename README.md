# OpenFX

OpenFX 是我的个人开源项目集合仓库（monorepo）。

以前写过的有价值的小项目和正在开发的产品，都统一放在这里管理——从数据存储和边缘节点等
实验性工具，到 Perry 桌面应用和 Deno 全栈 Web 应用，全部汇聚在一个仓库中持续迭代。

这个仓库的设计原则是：**快速迭代**、**纯函数优先的领域逻辑**，以及**人类与 Agent 协作
开发**。

## 为什么选择这套技术栈

这套技术栈主要服务于 `entry/desktop` 和 `entry/web` 两个入口应用。各个 domain 可以
根据自身需求选择合适的技术——新旧项目并入时暂不强制统一，后续逐步收敛。

### 全面使用 TypeScript

桌面端、Web 端与共享领域逻辑统一使用一种语言，可以显著提升迭代效率并降低长期维护成本。

### 桌面端选择 Perry

Perry 最符合桌面端需求，因为它可以直接将 TypeScript
编译为单个原生可执行文件，而不是额外打包浏览器运行时。

### Web 端选择 VitePlus + React + Nitro

Web 端当前采用 VitePlus + React 负责前端开发体验与交互界面，Nitro 负责服务端路由与 Deno
Deploy 输出。这个组合保留了快速前端迭代能力，同时继续满足 Deno Deploy 的部署 约束。

### 为什么是 VitePlus 而不是旧 Fresh 工作流

此前的 Fresh 基线在热更新和新版本工具链兼容性上已经成为约束。当前方案直接采用 VitePlus
作为前端构建入口，减少中间兼容层，让 Web 端能够跟随更现代的 Vite 生态。

## 仓库结构

```text
domains/          领域模块（每个子项目一个 domain）
  dss/            Data Storage Station — DenoKV 存储与 SSE 实时推送
  esn/            Edge Storage Node — OPFS 分布式文件存储与 WebSocket 中继
  downip/         IPv6 映射/重定向业务
  how-much/       商品比价应用
  proxy/          HTTP 中继业务
  e/              Agent 执行框架
  wanone/         万一 — 你编程生涯的第一个项目（静态纪念站点）
  _shared/        跨 domain 共享工具
    kv.ts             DenoKV 封装（ScopedKv + SSE 实时流）
    typed-codec.ts    类型感知 JS 序列化（Map/Set/BigInt 等 → JSON）
    ws-rpc.ts         WebSocket 请求/响应模式（socket.reply）
    ws-client.ts      浏览器 WebSocket 连接管理（心跳/重连/就绪）
    broadcast-relay.ts BroadcastChannel 跨 region 消息中继
    node-registry.ts   DenoKV 节点注册与状态追踪
    opfs-engine.ts    浏览器 OPFS 文件存储引擎
entry/            入口应用
  desktop/        Perry 原生桌面应用
  web/            VitePlus + React + Nitro Web 应用
.agents/          Agent 行为规范与 skill
```

## 开发原则

1. **纯函数优先**
   - 业务规则尽量放入 `packages/core`。
   - 优先使用显式、不可变的数据变换。
2. **只有在合理时才使用面向对象**
   - 仅当运行时生命周期或集成约束使面向对象方案明显更合适时，才引入对象状态。
3. **应用层保持轻薄**
   - `apps/desktop` 与 `apps/web` 应主要负责 IO、渲染与运行时装配。
4. **文档是产品的一部分**
   - 结构性变更应在同一变更中同步更新文档。

## 快速开始

### 前置依赖

- [Deno](https://deno.com/)
- [Perry](https://docs.perryts.com/)
- 如果你希望通过终端发布或管理仓库，还需要安装 [GitHub CLI](https://cli.github.com/)

Web 端依赖现在统一由 Deno 和 `deno.lock` 管理，不再需要单独安装 `pnpm`。

### 启动 Web 应用

```bash
deno task web:dev
```

生产构建：

```bash
deno task web:build
```

构建产物预览：

```bash
deno task --config apps/web/deno.json preview
```

### 构建桌面应用

```bash
perry compile apps/desktop/src/main.ts -o dist/openfx-desktop
```

### 校验

```bash
deno task check
```

这条校验现在还会执行 Deno-only guard，防止 `pnpm-lock.yaml`、`pnpm`
构建命令或带依赖字段的 `package.json` 被重新引回仓库。

## 路线图

路线图现在直接集成在本 README 中，作为默认的人类入口文档之一。

### 近期目标

- [ ] 将遗留小项目（dss、esn…）作为 domain 并入仓库并适配当前目录规范
- [ ] 为每个 domain 补充 README.md 和基础测试
- [ ] 夯实 desktop、web、docs 与 agent guidance 的 monorepo 基线
- [ ] 将 Web 应用接入真实的 Deno Deploy 项目
- [ ] 为 Perry 桌面二进制建立自动化发布打包流程

### 中期目标

- [ ] 将共享领域层（`_shared/`）抽象为稳定可复用的包
- [ ] 建立统一的 Deno 任务入口——一个命令启动所有 domain 的开发/测试
- [ ] 增加第一个同时覆盖桌面端与 Web 端的真实用户工作流
- [ ] 为每个 domain 补充架构决策记录
- [ ] 引入契约测试保证跨 domain 的数据一致性

### 长期目标

- [ ] 支持桌面端与 Web 端之间更丰富的同步能力
- [ ] 发布稳定的 OpenFX 可复用公共 API
- [ ] 构建与仓库内 skill、知识索引保持一致的贡献者自动化体系

### 路线图维护规则

- 人类维护者可以直接编辑本节内容。
- Agent 应将本节视为方向性产品输入，而不是自动生成产物。
- 如果实现偏离路线图，应同步更新本节与下方的架构决策记录。

## 架构决策记录

架构决策记录也直接集成在本 README 中，而不是再拆分到独立文档。

### ADR 0001：OpenFX 初始技术栈

#### 状态

已采纳

#### 决策

OpenFX 以 TypeScript monorepo 方式启动，采用：

- **Perry** 作为桌面应用方案
- **VitePlus + React + Nitro** 作为 Web 应用方案
- **Apache-2.0** 作为仓库开源协议

#### 背景

仓库需要同时满足以下要求：

- 使用 TypeScript 保持快速迭代
- 桌面端可以分发单文件原生二进制，而不是捆绑沉重的浏览器运行时
- Web 端运行时可兼容 Deno Deploy
- 编码风格偏向纯函数，方便自动化测试

#### 原因

##### 为什么是 Perry

Perry 直接满足“桌面应用输出为单个原生可执行文件”的核心诉求，同时保持实现语言统一为
TypeScript。

##### 为什么是 VitePlus + React + Nitro

Web 端需要更直接的前端热更新体验，同时仍然输出到 Deno Deploy。VitePlus + React 负责
前端开发和构建，Nitro 负责服务端路由与 `deno_deploy` 目标输出，两者组合更贴合当前仓
库的迭代需求。

##### 为什么放弃旧 Fresh 工作流

此前的 Fresh 工作流已经成为升级 Vite 与修复本地热更新的阻碍。直接切换到 VitePlus +
React + Nitro 后，开发、构建和部署链路都更清晰。

##### 为什么是 Apache-2.0 而不是 MIT

MIT 也可行，但 Apache-2.0 提供了更明确的专利授权，对公开应用型仓库更友好。

## Agent 指南

- 全局仓库规范：[AGENTS.md](AGENTS.md)
- 项目内 skill：
  [.agents/skills/openfx-repo/SKILL.md](.agents/skills/openfx-repo/SKILL.md)

## 开源协议

OpenFX 使用 **Apache-2.0** 协议。

原因：它在保持宽松开源许可特性的同时，提供了明确的专利授权保护，这对于公开的应用 /
平台型仓库更合适。
