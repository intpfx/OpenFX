# freemac

A Bun-first MVP scaffold for a Mac dashboard with public IPv6 observation,
telemetry, and a restricted natural-language agent.

## 并入 OpenFX

本 domain 从独立仓库 `intpfx/freemac` 迁入 OpenFX，并保留完整产品结构：

- 本地项目：`/Users/siaovon/Documents/Projects/freemac`
- 原云端仓库：`https://github.com/intpfx/freemac`（已删除）
- 对齐提交：`812a9f56129573cd28fe347262c6d640912f1cb8`
- 并入时间：2026-06-06
- 原仓库清理时间：2026-06-06

并入前已通过 GitHub API 确认云端 `main`、本地 `origin/main` 和本地 `HEAD` 均指向同一提交。
旧项目工作区仅有未跟踪的 `design-review/`，本次作为设计参考素材一并迁入。
确认迁入完整后，已删除本地原仓库 `/Users/siaovon/Documents/Projects/freemac` 和 GitHub 原仓库
`intpfx/freemac`。

freemac 不并入 `domains/e`。它是完整产品外壳：包含 Bun/Elysia 本机服务、React/Three.js
dashboard、Deno Deploy relay、macOS launchd 部署脚本和本机系统观测逻辑。`domains/e` 仍保持
运行时无关的 Agent 执行框架；freemac 后续可以作为 `e` 的产品外壳或参考应用接入。

## Workspace

- `apps/core`: Bun + Elysia local service
- `apps/web`: React + Vite+ dashboard
- `apps/deno-deploy`: Deno Deploy relay that stores the latest IPv6 endpoint in
  Deno KV and renders it in a web page
- `packages/shared`: shared types and schemas
- `deploy`: launchd and Caddy examples
- `docs`: setup and MVP notes

## Scripts

- `bun run dev`
- `bun run build`
- `bun run check`
- `vp install`

OpenFX 根级 Deno 校验排除 `domains/freemac/`，避免误处理 Bun/pnpm/VitePlus workspace。

## MVP scope

- Public IPv6 observation plus Deno Deploy relay reporting
- Local telemetry collection for macOS
- Browser dashboard with SSE updates
- Restricted tool registry with approval flow
- Single-user auth and audit logs

## Deployment

- Direct public IPv6 with a high port:
  [docs/deploy-direct-ipv6-high-port.md](docs/deploy-direct-ipv6-high-port.md)

## 结构

```text
domains/freemac/
├── apps/core/          # Bun + Elysia 本机服务
├── apps/web/           # React + VitePlus + Three.js dashboard
├── apps/deno-deploy/   # Deno Deploy relay 和反向代理页面
├── packages/shared/    # 共享类型和 Zod schema
├── deploy/             # launchd / direct IPv6 部署模板
├── design-review/      # hologram 目标态视觉参考
└── docs/
```

## 迁移边界

本次迁移保留完整源码和设计参考，但不迁入运行产物或本机状态：

- 未迁入 `.git/`、`node_modules/`、`.data/`、`apps/web/dist/`、`.DS_Store`、`*.tsbuildinfo`。
- 未迁入生成的本机配置 `deploy/env/freemac.core.env`。
- 未迁入旧项目 Git hook 目录 `.vite-hooks/`。
- 未迁入旧项目忽略的 `bun.lock`；保留已跟踪的 `pnpm-lock.yaml` 作为 workspace 锁文件。

## 可提炼模式

- Deno Deploy relay：KV 保存最新 IPv6 target，并通过 `/app` 反代本机服务。
- macOS telemetry parser：`top`、`vm_stat`、`df`、`netstat`、`pmset`、`ps` 的轻量解析。
- agent tool approval/audit：只读工具与需审批工具分层，执行请求写入审计日志。
- WebSocket agent stream：agent state、token、tool event 和 telemetry 的统一推送协议。

## 验证状态

并入后已完成以下验证：

```bash
deno task --config domains/freemac/apps/deno-deploy/deno.json check
```

迁移完整性也已通过逐文件对比确认：除 README、`.gitignore`、启动脚本和文档链接这类迁移适配外，
旧仓库已跟踪源码与 `domains/freemac/` 一致；未跟踪的 `design-review/` 也已完整复制。

`pnpm install --frozen-lockfile` 当前不通过，原因是旧项目既有的 `pnpm-lock.yaml` 与
`apps/core/package.json` 不一致：lockfile 里仍记录了已移除的 `@elysiajs/static`。本次迁移不自动修复
lockfile，后续如果要继续开发 freemac，应先运行非 frozen install 更新锁文件，再跑 `pnpm check`。

## 与 domains/e 的关系

freemac 当前自带 agent scaffold，包括 OpenAI-compatible local model、工具规划、WebSocket token
stream 和审计日志。但它仍是产品层实现，不应把 Bun、macOS 命令、Web UI 或 relay 逻辑搬进
`domains/e`。

后续产品化时可以逐步改为：

- 用 `domains/e` 的 `ForegroundSessionController` 替换自制前后台状态流。
- 用 `SafetyActionGate` / `ToolRunner` 承接 freemac 的工具审批和执行。
- 用 `ProgressEvent` 映射 dashboard 的 agent state、tool event 和 token stream。

## 安全与成熟度

- `FREEMAC_PASSWORD` 仍有 `changeme123` fallback，生产运行必须完成首次初始化或设置环境变量。
- `docs/mvp-setup.md` 已标注 auth guard 仍是后续目标，当前部分 API 仍偏 MVP。
- `executor.service.ts` 仍是 scaffold，并未真正执行 `process.kill` 等系统动作。
- Deno Deploy relay 会反代本机服务，公网使用前需要审查 auth、CORS、目标 URL 和 token 策略。
