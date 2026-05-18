# OpenFX

OpenFX 是一个公开的 TypeScript monorepo，当前承载两个开源产品：

- 一个由 **Perry** 编译为单个原生二进制、便于分发的**桌面应用**
- 一个基于 **Deno** + **Fresh** 构建、适合部署到 **Deno Deploy** 的**Web 应用**

这个仓库有意围绕以下目标进行设计：**快速迭代**、**纯函数优先的领域逻辑**，以及**人类与
Agent 协作开发**。

## 为什么选择这套技术栈

### 全面使用 TypeScript

桌面端、Web 端与共享领域逻辑统一使用一种语言，可以显著提升迭代效率并降低长期维护成本。

### 桌面端选择 Perry

Perry 最符合桌面端需求，因为它可以直接将 TypeScript
编译为单个原生可执行文件，而不是额外打包浏览器运行时。

### Web 端选择 Fresh + Deno

Fresh 是构建 Deno 原生 Web 应用最自然的选择。它与 Deno Deploy 配合良好，服务端 /
运行时模型简洁，并且只在真正需要交互的地方启用 islands。

### 选择 Vite 而不是 Vite+

Vite+ 很有潜力，但仓库的初始基线优先选择当前更成熟、官方文档更完善的方案。Fresh
已经明确提供基于 Vite 的工作流，因此 Vite 是风险更低的公开项目起点。

## 仓库结构

```text
apps/
  desktop/   Perry 原生桌面应用
  web/       Fresh + Deno Web 应用
packages/
  core/      共享的纯领域逻辑与测试
.agents/
  skills/    仓库内的 Agent 行为规范
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

### 启动 Web 应用

```bash
deno task web:dev
```

生产构建：

```bash
deno task web:build
```

### 构建桌面应用

```bash
perry compile apps/desktop/src/main.ts -o dist/openfx-desktop
```

### 校验

```bash
deno task check
```

## 路线图

路线图现在直接集成在本 README 中，作为默认的人类入口文档之一。

### 近期目标

- [ ] 夯实 desktop、web、docs 与 agent guidance 的 monorepo 基线
- [ ] 将 `packages/core` 扩展为稳定的共享领域层
- [ ] 增加第一个同时覆盖桌面端与 Web 端的真实用户工作流
- [ ] 为 Perry 桌面二进制建立自动化发布打包流程
- [ ] 将 Web 应用接入真实的 Deno Deploy 项目

### 中期目标

- [ ] 如果 OpenFX 超出单一产品边界，定义插件或扩展机制
- [ ] 为共享核心逻辑引入更强的契约测试
- [ ] 为关键子系统补充面向贡献者的架构决策记录

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
- **Fresh + Deno** 作为 Web 应用方案
- **Vite** 作为 Web 开发 / 构建工具链
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

##### 为什么是 Fresh + Deno

Fresh 是构建 Deno 原生应用最直接的框架选择，并且天然贴合 Deno Deploy 的部署目标。

##### 为什么选 Vite 而不是 Vite+

Vite+ 虽然值得关注，但公开仓库的初始基线应优先选择 Fresh
当前官方文档明确支持、生态更稳妥的方案。

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
