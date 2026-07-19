# OpenFX Perry 沉浸式节点应用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前调试面板升级为带沉浸式核心、完整配对引导、Dock 与菜单栏入口的正式 arm64
macOS 应用，并修复完整 UI 进程中的原生 HTTP 健康接口。

**Architecture:** 运行时、采集和 Agent 逻辑保持不变；新增纯函数 UI 模型与 Canvas
帧模型，Perry 入口只负责原生控件、生命周期和绘制。默认以普通 macOS
应用运行，用户可选择下次启动进入仅菜单栏模式。

**Tech Stack:** Perry 0.5.1220 补丁运行时、Perry UI/AppKit、Core Graphics Canvas、Deno
测试与构建工具、React 控制台。

## Global Constraints

- 不改变现有云端配对协议、单管理员/单节点约束和公网 IPv6 要求。
- 不引入 Electron、Tauri、WebView 或 WebGL；沉浸式核心使用 Perry Canvas/Core Graphics。
- 默认保留 Dock；仅菜单栏模式必须由用户主动选择并在下次启动生效。
- 本轮交付本地可运行、ad-hoc 签名的 arm64 `.app`，不包含公证和发行签名。
- 桌面与 Web 产品文案使用简体中文；业务逻辑保持纯函数，入口只负责 I/O 和生命周期。

---

### Task 1: Perry 运行时与真实 UI 主应用门

**Files:**

- Modify: `entry/desktop/src/main.ts`
- Modify: `entry/desktop/tools/build-perry-runtime.ts`
- Modify: `entry/desktop/perry/perry-v0.5.1220-openfx.patch`
- Create: `entry/desktop/tools/desktop-app-smoke.ts`
- Modify: `entry/desktop/tests/desktop-contract.test.ts`

**Interfaces:**

- Produces: `deno task desktop:app-smoke`，编译真实 `main.ts`、启动 UI、验证
  `[::1]:24531/v1/health`、截图并退出。

- [ ] 先写完整 UI app smoke 和运行时构建契约测试，并确认因当前 health
      超时或契约缺失而失败。
- [ ] 将服务启动交给 App 事件循环调度，删除 `App()` 后不可达的生命周期更新。
- [ ] 让补丁运行时同时构建固定提交的 `perry-ui-macos`，正式构建不得回退到 Homebrew UI
      库。
- [ ] 扩展 Perry 补丁：stdlib pump 始终运行；隐藏窗口仅暂停 frame callback；Tray
      相对路径解析 bundle Resources 和可执行目录。
- [ ] 验证真实主应用 health、截图和已有 HTTPS 组合 smoke。
- [ ] Commit: `fix(desktop): gate the real Perry UI runtime`

### Task 2: 状态模型、启动模式与配对准备度

**Files:**

- Modify: `entry/desktop/src/core/types.ts`
- Modify: `entry/desktop/src/core/desktop-state.ts`
- Create: `entry/desktop/src/core/pairing-readiness.ts`
- Create: `entry/desktop/src/core/ui-model.ts`
- Modify: `entry/desktop/src/native/preferences.ts`
- Create: `entry/desktop/tests/ui-model.test.ts`

**Interfaces:**

- Produces: `DesktopLaunchMode = "regular" | "menuBarOnly"`、扩展后的
  `DesktopPreferences`、`derivePairingReadiness()`、`describeDesktopError()` 和纯函数 UI
  快照。

- [ ] 先写旧偏好迁移、启动模式、静态核心、配对有效/无效组合和中文错误映射测试并确认失败。
- [ ] 扩展偏好与同步启动读取接口；旧数据固定迁移为 `regular`/`false`。
- [ ] 实现配对准备度与用户可读错误映射，不改变网络协议。
- [ ] 实现纯函数 UI 模型，所有界面状态均输出确定字符串，不允许 `undefined`。
- [ ] 运行桌面测试和格式检查。
- [ ] Commit: `feat(desktop): model node presentation and pairing readiness`

### Task 3: 沉浸式 Perry 主窗口、Dock 与 Tray

**Files:**

- Create: `entry/desktop/src/ui/core-frame.ts`
- Create: `entry/desktop/src/ui/core-canvas.ts`
- Create: `entry/desktop/src/ui/control-panel.ts`
- Create: `entry/desktop/src/ui/tray.ts`
- Modify: `entry/desktop/src/main.ts`
- Modify: `entry/desktop/src/perry-ui-stub.ts`
- Create: `entry/desktop/tests/core-frame.test.ts`

**Interfaces:**

- Produces: `createCoreFrame()` 的确定绘制模型、24 FPS Perry Canvas
  renderer、显式文本更新的主窗口控制器和品牌 Tray。

- [ ] 先写 Canvas 帧确定性、边界、状态色与静态模式测试并确认失败。
- [ ] 实现同心环、轨道节点、脉冲和连接线的纯函数帧模型。
- [ ] 使用 Perry Canvas/Core Graphics 实现 24 FPS 绘制；静态模式只画一帧。
- [ ] 构建约 960×640、最小 880×580、带 vibrancy
      的左右分栏窗口；未配对显示三步向导，已配对显示节点仪表盘。
- [ ] 默认 `regular`，用户选择的 `menuBarOnly` 只在下次启动应用；所有状态标签使用
      `textSetString` 等显式更新。
- [ ] Tray 使用 FX 模板图标，菜单固定包含显示、状态、采样、打开控制台和退出。
- [ ] 运行桌面测试、Perry deep check 和真实 UI screenshot smoke。
- [ ] Commit: `feat(desktop): add the immersive Perry node interface`

### Task 4: arm64 macOS `.app` 构建

**Files:**

- Create: `entry/desktop/tools/build-macos-app.ts`
- Create: `entry/desktop/assets/openfx-tray-template.png`
- Modify: `deno.json`
- Modify: `entry/desktop/deno.json`
- Modify: `entry/desktop/README.md`
- Modify: `README.md`

**Interfaces:**

- Produces: `deno task desktop:app` 和 `dist/OpenFX Node.app`；Bundle ID
  `com.openfx.node`，最低 macOS 13，ad-hoc 签名。

- [ ] 先写 app bundle 清单、资源路径和构建命令契约测试并确认失败。
- [ ] 实现 Deno 构建器：强制 `PERRY_LIB_DIR`、编译 arm64 Mach-O、生成
      `Info.plist`、复制图标、创建 `.icns`、ad-hoc codesign。
- [ ] 添加正式 OpenFX 应用图标和透明 FX Tray 模板图标。
- [ ] 添加 `desktop:app` 与 `desktop:app-smoke` 任务并更新桌面/根 README。
- [ ] 用 `file`、`lipo`、`plutil`、`codesign --verify` 验证产物。
- [ ] Commit: `build(desktop): package the arm64 OpenFX Node app`

### Task 5: Web 配对引导、文档与最终验收

**Files:**

- Modify: `entry/web/src/console/ConsoleApp.tsx`
- Modify: `entry/web/src/console/console.css`
- Modify: `entry/web/tests/console-ui.test.ts`
- Modify: `docs/openfx-console-architecture.md`

**Interfaces:**

- Preserves: 所有现有配对、节点密钥、KV、SSE 和 Relay API。
- Produces: HTTPS 服务端地址复制、短码倒计时、IPv6/Keychain 指引、HTTP
  环境阻断和节点上线自动状态。

- [ ] 先写 HTTPS/HTTP 配对展示契约、倒计时和节点上线状态测试并确认失败。
- [ ] 扩展配对卡片：复制当前 HTTPS origin、倒计时、三步说明和安全要求。
- [ ] HTTP 页面禁用生成配对码并显示“请通过 HTTPS 控制台打开”。
- [ ] 保持 SSE 驱动的节点上线更新，不增加手动刷新或新协议。
- [ ] 使用 Codex 内置浏览器验证桌面与窄屏；HTTP 预览必须展示阻断说明。
- [ ] 更新架构、恢复和人工验收文档。
- [ ] 运行全仓 check、确定性 Web build、Perry deep check、`.app`/UI smoke 和真实 HTTPS
      组合 smoke。
- [ ] Commit: `feat(console): guide native Mac pairing`

## Final Acceptance

```bash
deno task check
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
  VITE_OPENFX_BUILD_HASH=local00 \
  deno task --config entry/web/deno.json build
deno task perry:runtime --source /path/to/Perry-v0.5.1220
deno task desktop:app
deno task desktop:app-smoke
deno run --unstable-kv -A entry/desktop/tools/console-integration-smoke.ts
```

人工验收必须确认：首次启动显示 Dock、应用菜单、FX 菜单栏图标和主窗口；关闭窗口后
health/采样/Relay 继续；Dock 与 Tray 均能重新打开；仅菜单栏模式重启后生效；真实配对可从
Keychain 恢复。
