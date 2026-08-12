# OpenFX

OpenFX 是一个以 TypeScript 为主的个人项目集合。当前主产品是运行在浏览器中的 OPFS
文件库；仓库同时保留可独立运行的 domain、历史项目和可复用能力模块。

## 当前产品

`web/` 提供 VitePlus + React 客户端和 Nitro 服务端，部署目标为 Deno
Deploy。首页不是本机文件浏览器，也不是营销页，而是由应用自管理的文件库：

- 用户通过文件选择器、拖放、PWA 文件处理器或系统分享入口显式导入内容；
- 原始字节和索引保存在当前 origin 的 `/openfx-file-library/` OPFS
  空间，不保留本机路径映射；
- 图片、实况图片、视频、音频、文本和 PDF 可在应用内预览；
- 链接作为本地条目保存；不支持预览的格式保留原件并提供下载；
- 视频缩略图、字幕关系、播放位置、观看状态和媒体智能视图由文件库索引维护；
- 照片在导入落盘后由可取消 Worker 解析 EXIF、位置和 Motion Photo；任务状态持久化，
  中断后可恢复、失败后可重试；
- 照片可按拍摄日期、实况、收藏、位置和相册派生查看，不复制原始字节；
- 13 个内置 App 作为只读虚拟条目合并到同一内容墙，不占用 OPFS 配额。

文件库内容墙使用无间距正方形网格。少量内容只占需要的列，未占用区域保持磨砂背景；
触屏可像照片应用一样双指缩放，在 2–5 列之间切换并保存本机显示偏好。点按内容只会更新
页面顶部的全宽 HUD 预览，打开、收藏和更多操作通过预览底部的图标执行，只有“打开”才
进入全窗口查看器；没有动态预览的 App 会在 HUD 中展示 catalog 的名称、技术栈与完整说明。
搜索与打开、收藏、导入、保存链接、新建文本和查重操作共用一条无边框工具条，不提供额外
视图筛选；所有操作使用轻量线性图标，悬停只高亮图标线条。当前项目数直接写入搜索占位
文案；页面不提供手动明暗开关，只实时跟随系统主题。移动端竖屏时 HUD 预览固定在顶部并 占约
40% 视口高度，工具条与其相接；下方内容矩阵在始终保留顶部圆角的独立容器内滚动。

### 重复与相似文件

文件库会在导入完成后以可取消的后台任务生成版本化指纹：

- 所有普通文件使用 SHA-256 检测字节完全一致的副本；
- 图片使用 256 位 PDQ 感知哈希识别缩放、压缩或轻微调整后的相似内容；
- 视频在 8%–92% 的相对时间位置抽取最多 8 帧，按 PDQ 序列、时长容差和多数帧匹配；
- 实况图片必须同时满足静态图与动态片段相似；完全重复还要求两部分 SHA-256 均一致；
- 旧索引升级后会自动补算指纹，单个文件失败不影响其原件、下载和其他分析任务。

“查重”只打开候选审阅视图并标记“完全重复”或“相似”，不会自动删除文件。用户仍需在
全窗口查看器中逐项确认并使用现有删除操作，避免感知哈希误判造成数据损失。

### 实况图片边界

当前文件库已经实现：

1. 同名图片与 MOV/MP4 的导入配对；
2. JPEG Motion Photo 的 XMP 检测、尾部 MP4 提取与 OPFS 保存；
3. OpenFX 旧二进制与 ZIP `.livp` 双格式探测和导入，并以无压缩 UTF-8 ZIP 作为 canonical
   导出格式；
4. 静态图与动态片段的全窗口查看，包括桌面悬停、移动端长按、松手复位、静音和 触觉反馈；
5. JPEG EXIF 的方向、尺寸、拍摄时间、相机、镜头、曝光、评分和 GPS 解析；
6. 持久化照片分析队列，以及收藏、相册、日期和位置派生视图。

OpenFX 二进制 `.livp` 与 ZIP 容器不是同一格式，因此导入时先探测再解码。ZIP 读取支持
stored 和 deflate 条目；未知变体仍作为普通文件安全保存。这里的 `.livp` 是 OpenFX
交换格式，不应对外宣称已经支持 Apple Photos 原生导入、Quick Look 或所有第三方变体。

### LivpExplorer 迁移与退役结论

原 `domains/LivpExplorer/` 是从 ChronoFrame 导入并改名的独立自托管照片库，使用 Nuxt
4、Vue、SQLite/Drizzle 和独立 pnpm workspace。它从未成为 Web 首页的运行依赖。

可迁移的本地照片能力已经由 `web/src/file-library/` 和 `domains/_shared/livp-codec.ts`
接管：同名配对、Motion Photo、Live Photo 交互、EXIF/GPS、
相册/收藏/派生视图、可恢复处理任务，以及 LIVP 双格式导入和 canonical 导出均不再依赖 原
Nuxt 应用。迁入实现使用浏览器 File、Worker 和 OPFS 边界，没有复制 Vue 页面、Drizzle
模型或 SQLite 服务。

分享/reaction、账号体系、SQLite、S3/OpenList、服务端公开 URL、反向地理编码供应商和
管理后台属于另一个多用户产品，不迁入本地优先文件库。若未来需要同步，应作为可选
适配器重新设计，而不是保留对 LivpExplorer 的依赖。

迁移回归验证完成后，`domains/LivpExplorer/` 上游源码快照已于 2026-08-10 物理删除，
`deno.json` 中仅用于跳过该独立工具链的两条排除项也已移除。迁入代码的 ChronoFrame MIT
归属继续固化在根 `NOTICE`，不依赖旧目录存在。

## 仓库结构

```text
domains/          独立产品、历史项目和共享能力
  _shared/        运行时边界明确的共享算法与基础设施
  BewlyScript/    B 站桌面原站美化 userscript
  e/              运行时无关的 Agent 执行框架
  media-player/   文件库专用最小播放器
web/              OPFS 文件库与 React + Nitro Web 产品
```

主要 domain：

| Domain                | 定位                                     | 与 Web 首页的关系        |
| --------------------- | ---------------------------------------- | ------------------------ |
| `_shared`             | 文件库 LIVP 容器编解码边界               | 被 Web 文件库引用        |
| `BewlyScript`         | Vue userscript，输出单文件安装包         | 内置 App 与安装入口      |
| `chinagas-wms-qrcode` | WMS 物料二维码 userscript                | 内置 App 介绍            |
| `costing-assistant`   | 浏览器本地工程计价助手                   | 动态预览 App             |
| `e`                   | Agent core、reference runtime 与前台协议 | 内置 App 介绍            |
| `finlyzer`            | 本地优先账单分析 Electron 应用           | 动态预览 App             |
| `gasmap`              | 燃气工程单线图工具                       | 动态预览 App             |
| `hlc`                 | 圣灯社区 PWA/CMS                         | 只读同源展示 App         |
| `how-much`            | 商品价格查询与地图报告                   | Web API 与内置 App       |
| `map-poster`          | OSM 地图海报生成器                       | Web API 与内置 App       |
| `media-player`        | OPFS 视频读取、Video.js 控件和播放引擎   | 文件能力，不重复作为 App |
| `wanone`              | 早期静态站点纪念项目                     | 动态预览 App             |

Web 文件库还索引 Smartisax、LiveSystem 和 WanderingPlan 等外部项目。App 的公开文案、
preview 和链接保存在 `web/content/library-apps.json`；ID、详情 renderer 与嵌入策略由
`web/library-app-catalog.ts` 统一校验。

文件库界面在手机竖屏使用固定的顶部 HUD 与下方滚动矩阵；手机横屏和桌面宽屏统一切换为
左侧固定 HUD、右侧独立滚动矩阵，搜索和操作工具栏固定在 HUD 底部。两种布局都保持内容格
为正方形，并支持双指缩放调整列数。

Web 入口的几个深 Module 分别承担稳定边界：

- `src/file-library/file-library-session.ts` 管理 OPFS 加载、用户 mutation、存储状态、
  照片/指纹/视频缩略图队列，以及文件处理器和播放器消息；React 首页只订阅 snapshot；
- `library-app-catalog.ts` 将 App 内容清单和 renderer 能力收成一份可校验 catalog；
- `publication-targets.ts` 是 Nitro 静态资产、Vite
  开发代理和构建前准备目标的共同事实源；
- `domains/map-poster/src/web-service.ts` 管理地图海报输入与生成 use case，
  `viewport.ts` 管理纯 Web Mercator/瓦片计算，Web 服务层只注入 Nominatim adapter。

## 开发

前置依赖为 Deno。根目录常用命令：

```bash
deno task dev
deno task dev:client
deno task dev:server
deno task build
deno task check
```

- `dev` 先准备 HLC 与播放器静态资源，再同时启动客户端和服务端；
- `dev:client` 只启动当前源码的 Vite 客户端：`http://localhost:5501`；
- `dev:server` 只启动 Nitro API 与静态资源服务：`http://localhost:3000`；
- 日常开发应进入 5501；3000 主要供 5501 的开发代理使用，不作为前端热更新入口；
- 并行实例可分别用 `OPENFX_VITE_DEV_PORT` 与 Nitro 标准的 `PORT` 改写端口；
- 根 `deno.lock` 管理 Web 与 Deno workspace 依赖。
- 根目录和 `web/` 只以各自 `deno.json` 为配置源；根 `package.json` 与
  `package-lock.json` 已移除，并由 `deno task guard:deno-only` 防止回归。
- Web 客户端通过 Deno 脚本调用 VitePlus Core，不依赖 `vp` 对 `package.json` workspace
  的发现行为。

根 `deno.json` 同时保存 Deno Deploy 的构建与动态运行时配置。本机 Deno 2.9.5 可直接
上传当前 checkout 并创建预览 revision：

```bash
deno task deploy
```

命令从仓库根上传源码，在 Deploy 构建环境运行 `deno task build`，并以
`web/.output/server/index.ts` 作为动态入口。根配置固定发布到
`universes/openfx`；只有明确准备 切换生产流量时才追加 `--prod`。CI 或 Agent 使用
`DENO_DEPLOY_TOKEN`，并追加 `--json --non-interactive`。

`domains/media-player/.openfx-public/` 保存最小播放器的确定性发布快照。普通开发和 GitHub
CI 会从 domain 源码重新构建它，CI 同时检查快照无差异；Deno Deploy 直接复用该
快照，避免在 3 GiB builder 中再次运行独立 pnpm 安装。

这里的“统一”为根产品工具链收口，不是删除所有 domain 的包清单。下列独立产品仍由其
上游工具链读取各自的 `package.json` 和锁文件，因此继续保留：

独立工具链：

| 范围                   | 常用命令                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `domains/BewlyScript`  | `bun install`、`bun run dev`、`bun run check:userscript`                                  |
| `domains/media-player` | `deno run --no-config -A openfx/build.ts`、`deno run --no-config -A npm:pnpm@9.15.9 test` |
| `domains/map-poster`   | `bun test`、`bun run typecheck`                                                           |
| `domains/finlyzer`     | `pnpm dev`、`pnpm dist:win`                                                               |

### Web 服务边界

公开入口包括：

- `GET /api/health`
- `/api/how-much/*`
- `POST /api/map-poster/render`
- `/media-player/*`
- `/hlc/*`

Map Poster 生产环境需要：

- `OPENFX_MAP_POSTER_NOMINATIM_SEARCH_URL`
- `OPENFX_MAP_POSTER_NOMINATIM_REVERSE_URL`

生产构建使用有界 Deno 入口：请求体在进入 Nitro 前限制为 64 KiB，并使用运行时真实远端
地址覆盖外部伪造的转发地址。

### 特殊模块

- `media-player` 只保留 OPFS 读取、字幕、续播、Video.js 10 控件以及 `playsvideo@0.4.7`
  的直通、解封装、分段和必要音频转码。完整 PlaysVideo domain 已物理删除；固定引擎保存在
  vendor 包中。
- HLC Web 展示只复制地图和艺术资产，不发布认证、内容工作流或写入接口。修改
  `domains/hlc/source/index.html` 后运行：

  ```bash
  deno run --no-config --allow-read --allow-write domains/hlc/tools/build-display-app.ts
  ```
- BewlyScript 只交付 userscript，不恢复 WebExtension popup/options/商店打包。
  `m.bilibili.com` 只显示请求桌面站提示，不挂载主 Vue App。
- `domains/e` 的 core 必须保持运行时无关；文件系统、模型、Git、MCP 和副作用通过接口
  注入，危险动作经过 `SafetyActionGate`。

## 文档约定

项目源码只维护两份 Markdown 文档：

- `README.md`：面向人的产品、架构、运行和迁移说明；
- `AGENTS.md`：面向开发 Agent 的工作约束与验证规则。

不要新增 domain 级 README、AGENTS、SKILL、历史计划或设计 QA 文档；相关有效信息应归并
到上述两份文件。LICENSE、NOTICE、代码注释、API 类型和测试不属于此限制。

## 清理记录

- Perry 桌面端、Proxy、Downip、LivpExplorer 与完整 PlaysVideo domain 已从当前项目移除；
- PlaysVideo 仍被使用的最小发布引擎已固定在 `domains/media-player/vendor/`；
- `_shared` 中没有产品调用的历史工具已删除；只服务 `how-much` 的 KV adapter 已回归其
  domain，`livp-codec.ts` 按文件库事实边界保留；
- 历史设计稿、重复上游说明和旧清理报告已在文档收口时删除。

## 协议与来源

仓库主体使用 Apache-2.0，见 `LICENSE` 与 `NOTICE`。包含独立许可证的 domain
继续以各自目录中的 LICENSE 为准。主要上游来源包括 BewlyCat/BewlyBewly、
ChronoFrame、maptoposter 和 playsvideo；保留其源码许可与第三方声明。
