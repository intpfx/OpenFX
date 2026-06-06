# HLC

> 圣灯社区 · Holy Lantern Community · Deno + PWA + EditorJS CMS

HLC 是面向社区展示、群众留言和基层治理入口的 PWA 项目。它保留了一个完整的老项目形态：
前台是全屏触控式社区站，后台提供文章、图库、员工、组织、物资和请求管理。

## 并入 OpenFX

本 domain 从独立仓库 `intpfx/hlc` 迁入 OpenFX，并保留原项目结构：

- 本地项目：`/Users/siaovon/Documents/Projects/hlc`
- 原云端仓库：`https://github.com/intpfx/hlc`（已删除）
- 云端 `main` 提交：`8d58a5f81af4f28613200e9b3e221a11bc4abb4d`
- 并入时间：2026-06-05
- 原仓库清理时间：2026-06-06

并入前已通过 GitHub API 确认云端 `main` 与本地 `HEAD` 指向同一提交。旧项目本地工作区并非完全干净：
`index.js` 有 5 行未提交改动，`.DS_Store` 和 `source/.DS_Store` 未跟踪。本次迁移保留
`index.js` 的本地改动，因为它将 `source/style.css` 改为 Deno 2 import attributes 方式加载；
系统文件未迁入。确认迁入完整后，已删除本地原仓库 `/Users/siaovon/Documents/Projects/hlc`
和 GitHub 原仓库 `intpfx/hlc`。

## 当前能力

- PWA shell：生成 manifest、SVG/PNG/ICO 图标，并支持全屏移动端体验。
- 前台页面：社区风采、群众发言吧、四心治理、直播间二维码和多篇内容页入口。
- CMS 后台：基于 EditorJS 管理文章、图库、员工、组织、物资和请求。
- 双存储模式：本地使用 Deno KV 数据库文件，Deno Deploy 环境使用托管 KV。
- 内容寻址文件：上传文件按 SHA-256 命名为 `.hlc`，本地和云端使用不同存储后端。
- WebSocket 备份通道：支持以自定义 typed codec 传输备份消息。

## 结构

```text
domains/hlc/
├── handle.ts              # esbuild 打包 source/divertor.js -> main.js
├── index.js               # Deno 服务、API、KV、文件存储、PWA 资源
├── main.js                # 已打包浏览器端脚本
└── source/
    ├── divertor.js        # CMS/前台交互源码
    ├── index.html
    ├── style.css
    └── imgs/
```

## 运行

HLC 仍是独立 Deno 项目，当前未接入 OpenFX 的 Deno workspace。

```bash
cd domains/hlc
deno run -A --unstable-kv index.js
```

默认监听：

```text
http://localhost:8000/
```

重新打包浏览器脚本：

```bash
cd domains/hlc
deno run -A handle.ts
```

## 可提炼模式

- `encoder` / `deliver`：类型感知序列化，支持 Blob、Map、Set、TypedArray、BigInt 和
  `Deno.KvU64`。
- `.hlc` 内容寻址文件仓库：SHA-256 文件名、本地 `.files` 存储和云端 `file0` 适配。
- 本地/Deno Deploy 双运行模式：通过 `DENO_REGION` 在本地 KV 文件和云端 KV 之间切换。
- WebSocket `socket.reply()`：请求/响应式消息与 `randomStamp` 回执模式。

这些模式本次只做标注，不立即抽到 `domains/_shared/`，避免把遗留项目迁移扩大成重构。

## 安全风险

HLC 作为 legacy domain 保留，运行公网服务前需要先处理以下问题：

- `ADMIN_KEY` 默认回退值为 `sdsq`，必须改为强制环境变量。
- `/fetchUrl` 可请求任意远端 URL，存在 SSRF 风险。
- `/login` 包含 `makeZero`、`makeArrearage`、`makeBackup` 等高权限命令。
- `/files/<name>` 直接读取本地 `.files`，应增加文件名校验和访问控制。
- 上传文件没有尺寸、类型和配额限制。

## 验证状态

并入后已在 `domains/hlc` 内用以下命令启动并验证根页面、脚本、样式和 `/intro` KV 接口：

```bash
deno run -A --unstable-kv index.js
```

当前 legacy JavaScript 入口不通过 `deno check --no-config --unstable-kv --check-js index.js`：
主要问题是隐式 `any`、FormData/File 类型收窄、动态扩展 WebSocket 属性，以及旧第三方库类型不匹配。
因此 OpenFX 根级校验排除 `domains/hlc/`，后续若要产品化，应先拆分并类型化服务端模块。

## 迁移边界

本次迁移只做源码归档和价值标注：

- 保留原 Deno 单服务、静态 HTML/CSS 和打包后的 `main.js`。
- 不迁入旧项目的 `.git`、`.files`、`.DS_Store`、`node_modules` 或本地缓存。
- 不把 HLC 立即改造成 OpenFX Web 源码的一部分。
- OpenFX 根级 Deno 校验排除 `domains/hlc/`，避免误处理遗留 JavaScript 项目。
