---
name: openfx-repo
description: OpenFX monorepo 操作知识。覆盖核心技术模式、旧项目迁移工作流、已知陷阱。当提到 OpenFX 或 domain 迁移时加载。
---

# OpenFX Repo Skill

## 加载时机

在 OpenFX 仓库内工作时始终加载。README.md 和 AGENTS.md 也有人类可读的文档——本 skill
只记录 agent 写代码需要的操作知识：架构模式、路由表、迁移流程、陷阱。

---

## 核心技术模式

### ScopedKv 存储

所有 domain 共享一个 `Deno.Kv` 连接，通过 `_shared/kv.ts` 统一管理：

```ts
import { getDomainKv } from "../../_shared/kv.ts";

const scoped = await getDomainKv("how-much"); // scope: ["domains", "how-much"]
await scoped.set(["key", "subkey"], value); // 实际: ["domains", "how-much", "key", "subkey"]
```

- `ScopedKv` 自动给所有 key 加 `["domains", <domain>]` 前缀
- `getDomainKv()` 返回 `ScopedKv | null`，不可用时 caller 显式 fallback 到 memory store
- `getKv()` 单例共享一个 Deno.Kv 连接
- `streamKvEntries()` — 从 dss 提取的 DenoKV SSE 实时推送模式

### SPA 路由（无 React Router）

自制 `navigate()` + `usePathname()` hook：

```tsx
export function navigate(pathname: string) {
  globalThis.history?.pushState({}, "", pathname);
  dispatchPopstate();
}

export function App() {
  const pathname = usePathname();
  if (pathname === "/admin") return <Homepage initialPanel="admin-console" />;
  if (pathname !== "/downip") return <Homepage />;
  return <DownipPage />;
}
```

路由优先级：`/admin` → Homepage + admin 面板 / `/downip` → 全页 DownipPage / 其余 →
Homepage

### 通用面板系统

7 个面板通过 `ActiveDomainPanel` 联合类型 + `setActivePanel` 统一管理：

```tsx
type ActiveDomainPanel =
  | "admin-console"
  | "ipv6-sync-suite"
  | "how-much-this"
  | "relay-proxy-gateway"
  | "wanone-memorial"
  | "chinagas-wms-qrcode"
  | "costing-assistant";
```

卡片点击后在 `projects-zone` 内展开面板。footer 按钮变为"← 返回"。

#### View Transitions API 展开/收回

```tsx
import { flushSync } from "react-dom";

function openProjectPanel(panel: ActiveDomainPanel) {
  if (document.startViewTransition) {
    document.startViewTransition(() => flushSync(() => setActivePanel(panel)));
    return;
  }
  setActivePanel(panel);
}
```

**关键规则**：

- `flushSync` 是必需的（React 异步批处理 → VT 捕获相同 DOM → 无动画）
- 面板打开时通过 `.panel-active` class 把卡片的 VT name 设为 `none`，避免与面板同名冲突
- 不支持的浏览器静默降级
- 不加自定义 `scale`/`translate` keyframes（与 VT 内置位置插值冲突）
- 面板收回时如果当前路由是 `/admin` 且面板是 admin-console，同时 `navigate("/")`

#### 面板脚本加载

Web Component 用 `<script>` 标签动态加载（非 ES module），经 Nitro public assets 访问：

```tsx
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
```

### 项目卡片配置

`entry/web/content/homepage-projects.json` — JSON 定义 layout + 列 + 卡片列表。

类型定义在 `entry/web/homepage-projects.ts`：

- `HomepageProjectCard`（id, type, variant?, hidden?, name, description, tech[],
  sourcePath）
- `HomepageColumn`（id, offsetRem?, cards[]）
- `HomepageProjects`（layout.gridTemplateColumns, columns[]）

**unlock 机制**：`hidden=true` 的卡片需调 `/api/unlock` 后可见。全局开关
`DOMAIN_CONTENT_PUBLIC` 在 `entry/web/domain-access.ts` 设为 `true` 时跳过解锁。

### Nitro 路由表

| 路由                        | 文件                                     | 说明                          |
| --------------------------- | ---------------------------------------- | ----------------------------- |
| `/`                         | `index.get.ts`                           | SPA                           |
| `/admin`                    | `admin.get.ts`                           | Admin 后台                    |
| `/downip`                   | `downip.get.ts`                          | DownIP 全页                   |
| `/[key]`                    | `[key].ts`                               | DownIP 重定向                 |
| `/[key]/[...rest]`          | `[key]/[...rest].ts`                     | DownIP 重定向（带 rest path） |
| `/update`                   | `update.{get,post,options}.ts`           | DownIP 映射更新               |
| `/api/health`               | `api/health.get.ts`                      | 健康检查                      |
| `/api/unlock`               | `api/unlock.post.ts`                     | Unlock                        |
| `/api/proxy`                | `api/proxy.ts`                           | HTTP 中继（短路径）           |
| `/api/proxy/[...path]`      | `api/proxy/[...path].ts`                 | HTTP 中继（长路径）           |
| `/api/admin/kv`             | `api/admin/kv.{get,post,delete}.ts`      | KV 管理 CRUD                  |
| `/api/admin/unlocks`        | `api/admin/unlocks.{get,post,delete}.ts` | Unlock 规则 CRUD              |
| `/api/how-much/search`      | `api/how-much/search.get.ts`             | 比价搜索                      |
| `/api/how-much/suggestions` | `api/how-much/suggestions.get.ts`        | 搜索建议                      |
| `/api/how-much/upload`      | `api/how-much/upload.post.ts`            | 价格上传                      |
| `/api/how-much/location`    | `api/how-much/location.post.ts`          | 定位                          |
| `/api/how-much/report`      | `api/how-much/report.post.ts`            | 举报                          |

### Vite 已有 alias

`vite.config.ts` 配置了 `@domains`（→ `../../domains`）、`@web`（→ `./src`）、`@`（→
root）。`nitro.config.ts` 只有 `@` alias。Nitro 中跨域 import 仍需裸相对路径——见 §陷阱。

### 桌面工具

`entry/desktop/tools/desktop-sync-agent.ts` — 桌面端定时 IPv6 上报代理，配合
`domains/downip/server/` 做映射更新。

---

## 旧项目迁移

当被要求将旧项目并入 OpenFX 时，按以下 5 阶段工作流执行。

### 阶段 1：前置分析

1. 确认旧项目路径和远程 git 仓库（GitHub 有无未拉的代码）
2. 确认 OpenFX 仓库最新（`git pull`）
3. 确认该项目不是已迁移/已删除状态

### 阶段 2：价值分析

对每一个文件做审慎评估——**R-tree demo 级别的工具代码也不能跳过**：

1. 完整浏览项目结构
2. 检查 git log 历史提交中有无隐藏的算法/模式
3. 标注每个文件的处理结论：`_shared` / `domain` / `忽略`
4. **一次性列出所有可提取的模式**，用户确认一次再动手

### 阶段 3：决策

| 类型                        | 处理方式                            | 示例                   |
| --------------------------- | ----------------------------------- | ---------------------- |
| 纪念项目（第一个网站等）    | 完整保留为 domain，不改造           | wanone                 |
| 独立可维护子项目            | `domains/<name>/` 保持完整结构      | downip, how-much       |
| 基础设施代码（纯函数/算法） | 提取到 `domains/_shared/`，删原仓库 | core→9 模块, dss→kv.ts |
| 无提取价值的废弃项目        | 直接归档或删除                      | —                      |

#### 提取到 _shared

```ts
// ✅ 重构后
export function encrypt(seq: number, msg: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> { ... }
```

约束：

- Deno 2.x strict 模式 `Uint8Array` 需 `Uint8Array<ArrayBuffer>`
- 避免 `instanceof`，用 duck typing
- 浏览器端模块标记运行时边界，在 `deno.json` lint exclude 注册

#### 纪念项目处理

完整保留原始文件，不重构、不转技术栈、不改路径。wanone 模式：文件放
`domains/<name>/public/`，Nitro publicAssets 原样服务。

### 阶段 4：验证

```bash
deno check domains/_shared/<module>.ts
deno test --allow-env domains/_shared/tests/
deno task check
```

### 阶段 5：清理

1. 确认通过测试
2. 删除本地旧项目目录
3. 删除 GitHub 远程仓库（不需要的话）
4. 更新 `domains/_shared/README.md` 来源说明表
5. 更新 README 路线图迁移进度

### 已迁移索引

| 来源                        | 处理    | 产物                                                                                                        |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| core/（SGR 框架原型）       | _shared | binary-chunk, bytes-codec, crypto-dice, qrcode, swt, opfs-finder, idb-engine, island-notice                 |
| hiverepo                    | _shared | wechat-dat, comic-deobfuscate, hotlist-crawler                                                              |
| pmp                         | _shared | livp-codec, ffmpeg-pipeline                                                                                 |
| toys                        | _shared | spatial-index, dedup-files                                                                                  |
| dss（Data Storage Station） | _shared | kv.ts（ScopedKv + SSE 流）                                                                                  |
| esn（Edge Storage Node）    | _shared | typed-codec, ws-rpc, ws-client, broadcast-relay, node-registry, opfs-engine                                 |
| wanone（第一个网站）        | domain  | 纯静态归档不改动                                                                                            |
| GasMap                      | domain  | 燃气工程单线图绘制与统计工具，完整保留独立 Vite 项目结构                                                    |
| Finlyzer                    | domain  | 本地优先账单分析器，完整保留 Electron/Vite 项目结构并提供 OpenFX 静态入口                                   |
| hlc                         | domain  | 圣灯社区 PWA/CMS，完整保留 legacy Deno 单服务结构并标注可提炼模式                                           |
| freemac                     | domain  | Mac 本机仪表盘、IPv6 relay 与受限 agent 控制台，完整保留 Bun/VitePlus/Deno Deploy 产品结构                  |
| LivpExplorer                | domain  | 基于 ChronoFrame v1.0.0-rc.3 的自托管照片库；旧 SwiftUI LivpExplorer 的 Apple Photos/.livp 思路仅记录到文档 |
| 工程计价助手                | domain  | 完整保留 Vite 项目源码并提供 OpenFX 云端静态版本                                                            |
| chinagas-wms-qrcode         | 待迁移  | Tampermonkey 用户脚本                                                                                       |

### 经验教训

1. **一次列全 一次确认**：提取前列出所有可提取模式交用户一次确认
2. **解耦 > 大合并**：通用基础设施提取到 _shared
3. **保留+互补 > 替换**：新代码补充旧能力
4. **验证先行**：提取完就跑测试
5. **纯函数优先**：class → 顶层导出函数
6. **纪念项目不改造**

---

## 已知陷阱

### 1. 相对 import 路径容易算错

`entry/web/` 嵌套深。Vite 已有 `@domains` alias，Nitro 只有 `@`。

| 文件位置                                     | 到 _shared 的正确路径                |
| -------------------------------------------- | ------------------------------------ |
| `entry/web/src/*`                            | `../../../domains/_shared/`          |
| `entry/web/server/routes/*`                  | `../../../../domains/_shared/`       |
| `entry/web/server/routes/[key]/[...rest].ts` | `../../../../../domains/_shared/`    |
| `entry/web/server/routes/api/how-much/*.ts`  | `../../../../../../domains/_shared/` |

Nitro dev（Deno）能容忍部分错误路径，Rollup build 严格检查。添加新路由时验证所有
import。

### 2. handlers.ts 缺 re-export

Nitro dev 用 Deno 编译能处理缺失的 re-export，Rollup build 会报错。确认 route 文件
import 的来源文件中所有 symbol 确实被 export。

### 3. KvKeyPart 含 boolean

`Deno.KvKeyPart = string | number | bigint | boolean`。用 `Deno.KvKeyPart[]`
而非自定义子集类型。

### 4. lockfile 过期

```bash
deno install --frozen=false    # 不是 --frozen
```

### 5. SOCKS5 代理影响本地 curl

```bash
curl -s --noproxy "*" http://localhost:3000/api/health
```

### 6. `flushSync` 是 VT 必需

`document.startViewTransition` 回调中用 `setState` 不加 `flushSync` → React 异步批处理 →
VT 捕获相同 DOM → 无动画。

### 7. Vite native binding 失败

Vite 起不来时单独用 Nitro dev server：`deno task --config entry/web/deno.json dev`

### 8. ref 填充元素保持 DOM 存在

条件渲染移除 DOM 节点会导致 ref 内容丢失。用 CSS `display` 控制显隐：

```tsx
<span ref={labelRef} style={{ display: showPanel ? "none" : undefined }} />;
{
  showPanel && <span>← 返回</span>;
}
```

### 9. `.gitignore` 残留旧路径

仍包含 `apps/web/` 旧路径（Fresh 迁移前遗留）。添加忽略项时注意清理。

---

## 参考文件说明

`./references/` 下的文件：

| 文件                            | 状态                        |
| ------------------------------- | --------------------------- |
| `animejs-api-v4.md`             | ✅ 仍适用                   |
| `animation-cleanup-race.md`     | ✅ 仍适用                   |
| `css-conflict-diagnostics.md`   | ✅ 仍适用                   |
| `nitro-import-path-table.md`    | ✅ 仍适用                   |
| `sse-streaming-pattern.md`      | ✅ 已实现为 `_shared/kv.ts` |
| `fresh-architecture.md`         | ❌ 过时                     |
| `agent-guidance-restructure.md` | ❌ 部分过时                 |
| `project-migration-workflow.md` | ❌ 被本 skill 取代          |
| `esn-extraction-patterns.md`    | ❌ esn 已提取删除           |
