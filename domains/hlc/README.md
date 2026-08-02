# HLC

> 圣灯社区 · Holy Lantern Community · Deno + PWA + EditorJS CMS

HLC 是面向社区展示、群众留言和基层治理入口的 PWA
项目。它保留了一个完整的老项目形态：
前台是全屏触控式社区站，后台提供文章、图库、员工、组织、物资和请求管理。

## 并入 OpenFX

本 domain 从独立仓库 `intpfx/hlc` 迁入 OpenFX，并保留原项目结构：

- 本地项目：`/Users/siaovon/Documents/Projects/hlc`
- 原云端仓库：`https://github.com/intpfx/hlc`（已删除）
- 云端 `main` 提交：`8d58a5f81af4f28613200e9b3e221a11bc4abb4d`
- 并入时间：2026-06-05
- 原仓库清理时间：2026-06-06

并入前已通过 GitHub API 确认云端 `main` 与本地 `HEAD`
指向同一提交。旧项目本地工作区并非完全干净： `index.js` 有 5
行未提交改动，`.DS_Store` 和 `source/.DS_Store` 未跟踪。本次迁移保留 `index.js`
的本地改动，因为它将 `source/style.css` 改为 Deno 2 import attributes 方式加载；
系统文件未迁入。确认迁入完整后，已删除本地原仓库
`/Users/siaovon/Documents/Projects/hlc` 和 GitHub 原仓库 `intpfx/hlc`。

## 当前能力

- PWA shell：生成 manifest、SVG/PNG/ICO 图标，并支持全屏移动端体验。
- 前台页面：社区风采、群众发言吧、四心治理、直播间二维码和多篇内容页入口。
- CMS 后台：基于 EditorJS 管理文章、图库、员工、组织、物资和请求。
- 双存储模式：本地使用 Deno KV 数据库文件，Deno Deploy 环境使用托管 KV。
- 内容寻址文件：上传文件按 SHA-256 命名为 `.hlc`，本地和云端使用不同存储后端。
- WebSocket 备份通道：支持以自定义 typed codec 传输备份消息。

## 视觉改造设计

HLC
前台正在改造为基于圣灯社区真实地理骨架的等距手绘互动地图。设计基线包含地理证据、
内容场所映射、交互/响应式方案和第一版构图概念：

- [真实地理互动社区改造 PRD](./docs/visual-redesign-prd.md)
- [等距手绘构图概念图](./source/imgs/community-map.png)
- [Phase 11 社区服务中心高精分区试点](./docs/phase-11-service-center-pilot.md)
- [Phase 12 七场所高精艺术层](./docs/phase-12-place-art-layers.md)
- [Phase 13 社区服务中心内容体验试点](./docs/phase-13-service-content-pilot.md)
- [Phase 14 七场所内容体验](./docs/phase-14-all-place-content.md)
- [Phase 15 四角色权限与内容发布治理](./docs/phase-15-role-content-governance.md)

概念图不代表真实行政边界或建筑复原。Phase 6 重新把最初的 `community-map.png` /
`community-map.webp`
确立为永昌镇全景的正式视觉基准，保留原有构图、画面密度和手绘气质。它只承担全景层，
不会被连续放大成模糊底图；进入圣灯片区时，运行时会切换到独立绘制的
`community-map-detail-v1` 高精图层。

两个艺术图层共享 WGS84 投影相机。永昌镇离线矢量快照仍提供 156
条道路、水系、地景要素和范围编辑坐标，但不再作为前台主视觉。全景镜头按屏幕尺寸覆盖画布，
高精镜头则同时受视口覆盖和素材原始像素尺寸约束，避免把同一张低精位图无限拉伸；缩小会直接
回到完整全景，不会暴露单张局部图的边缘。 高精层额外保留约 6%
的视口外缓冲，并把拖动镜头限制在该图层的有效范围内；进入片区时待镜头
接近落定后再柔和显现细节图，避免清晰图块与模糊全景形成矩形硬接缝。

场所热点、镜头聚焦、地图依据、场所/服务深链接和原有内容入口继续工作；“圈定圣灯范围”工具可在
地图上绘制、撤销、保存并导出带版本信息的 WGS84
GeoJSON。该范围只定义后续高精艺术模型的加载区， 不是行政边界。Phase 4 使用
SVG、DOM/CSS 和二维投影，没有引入 Three.js。最终前台和发布素材包
不展示现实照片或写实视频，所有可见内容都需经过抽象艺术化处理。

用户圈定的四节点初版范围仍是项目默认高精加载区。总览层保持纯画面，通过滚轮或键盘放大进入
高精手绘片区后显示七个内容场所。高精图是依据旧版画风、真实地图方位和圈定范围形成的
抽象艺术化表达，不是现实照片、写实建筑复原或导航底图。此前用于验证范围密度的程序化建筑/院落
SVG 保留为隐藏的几何基础，不再作为正式前台画面。

Phase 10 删除了总览中的“圣灯片区”聚焦按钮，并让总览镜头默认额外放大约
6%。拖拽镜头同时
严格限制在全景手绘图的实际矩形内，四个方向拖到尽头仍由画面覆盖，不会露出世界画布的空白区域。
高精层继续采用常驻场所标签，不再显示序号圆点，也不再放大、高亮或抬升建筑。七个标签直接覆盖在
对应建筑、开放式房屋或实体木平台上，标签及其所在建筑区域均可点击；地图右侧控制按钮已移除，
拖动、滚轮和键盘浏览能力继续保留。“场所一览”仍是移动端和辅助技术的等价入口。

Phase 11 在圣灯高精层内部增加首个独立分区资产
`community-map-service-center-v1`。点击“社区服务中心”的建筑或常驻标签后，镜头进入更高像素密度的
河岸、前院和服务建筑近景；父级高精图仍在下方承接过渡，分区镜头也限制在自身有效矩形内。
分区 WebP
只在用户点击服务中心后加载，未进入该场所时不会增加首屏图片请求。该试点继续使用抽象
手绘素材，不包含现实照片或写实建筑复原。

Phase 12
把该分区模型扩展到全部七个场所。民意广场、初心学堂、共享工具屋、红茶小院、技能工坊和
河畔志愿点均拥有独立的 1672 × 941
手绘艺术层，与社区服务中心共用父级坐标、像素密度约束、
按需加载、柔和过渡和返回路径。每张 WebP
只在对应建筑被点击时加载，进入场所后仅保留当前场所
标签；图片仍是抽象艺术化插画，不包含实景照片、写实视频、UI 标记或地图截图。

Phase 13
先把社区服务中心的“走进社区、社区动态、社区示范”改造成统一的场所内容体验。
服务中心手绘分区继续承担主视觉，既有 CMS
页面负责正文和数据；三个栏目可以在同一纸页内切换，
深链接刷新后仍可恢复，返回时回到社区服务中心地图位置。试点使用 `abstract-only`
媒体策略，不直接展示现实人物照片、动态配图或现场视频；桌面采用左右场景，竖屏改为上下连续阅读。

Phase 14 把同一模型扩展到其余六个场所。七个场所共 15
项服务现在都使用对应的高精手绘图、场所强调色、统一栏目导航和正文包装器，同时保留留言、二维码、
会议、组织、工具借用、报名和志愿积分等既有功能。现实人物、活动、奖品和 CMS
图片继续隐藏；书记直播间二维码作为唯一功能性图像，以单色纸面框呈现。竖屏会根据一至四项服务
自动调整导航列数，返回地图时恢复原场所路由和旧页面 DOM 结构。

Phase 15 把 CMS
从共享管理员密钥迁移为四角色账户和服务端会话。普通访客只读公开内容；
已注册居民提交并查看自己的服务记录；社区工作者保存草稿、提交审核和维护资源；管理员负责发布、
归档、账户角色和审计。文章只有在管理员发布后才会写入公开
KV，保存草稿不会提前改变前台。 密码使用 PBKDF2-SHA-256 派生记录，会话使用
HttpOnly
Cookie；首个管理员必须通过环境变量引导创建。“场所一览”按钮和展开面板现已统一为同一个
导航状态组件：收起时显示按钮，展开后从同一左下锚点切换为场所列表、登录、居民注册或居民
账户视图，地图始终保留在背景中；返回列表或关闭组件都会复位该视图。自助注册固定为居民角色，
工作者与管理员仍由管理员授权创建，并只在认证成功后进入内容维护页。

## 结构

```text
domains/hlc/
├── docs/
│   ├── phase-11-service-center-pilot.md
│   ├── phase-12-place-art-layers.md
│   ├── phase-13-service-content-pilot.md
│   ├── phase-14-all-place-content.md
│   ├── phase-15-role-content-governance.md
│   └── visual-redesign-prd.md
├── handle.ts              # esbuild 打包 source/divertor.js -> main.js
├── index.js               # Deno 服务、API、KV、文件存储、PWA 资源
├── main.js                # 已打包浏览器端脚本
├── tests/
│   ├── community-access-model.test.js
│   ├── community-art-model.test.js
│   ├── community-auth-model.test.js
│   ├── community-content-workflow.test.js
│   ├── community-map-model.test.js
│   ├── community-focus-model.test.js
│   ├── community-world-data.test.js
│   └── community-world-model.test.js
├── tools/
│   ├── build-shengdeng-focus-data.ts # 将审定 GeoJSON 转为前端数据模块
│   └── build-yongchang-scene.ts # 从 OSM/Overpass 快照生成离线场景数据
└── source/
    ├── community-focus-model.js # 范围约束、高精资产与场所编排
    ├── community-art-model.js # 七场所艺术层矩形、像素密度与语义缩放
    ├── community-map.js   # 地图交互控制器
    ├── community-map-model.js # 热点、坐标与旧入口映射
    ├── community-world-model.js # 投影、镜头、LOD、分块与 GeoJSON
    ├── community-world-renderer.js # 艺术化 SVG 矢量渲染器
    ├── community-access-model.js # 四角色默认拒绝权限矩阵
    ├── community-auth-model.js # 密码凭据与 HttpOnly 会话 Cookie
    ├── community-content-workflow.js # 草稿、审核、发布、归档与审计模型
    ├── data/
    │   ├── shengdeng-focus.geojson # 用户圈定的初版工作范围
    │   ├── shengdeng-focus-area.js # 前端运行时范围模块
    │   └── yongchang-scene-data.js # 带许可元数据的离线 OSM 快照
    ├── divertor.js        # CMS/前台交互源码
    ├── index.html
    ├── style.css
    └── imgs/
        ├── community-map.png  # 永昌镇全景视觉基准
        ├── community-map.webp # 全景运行时优化格式
        ├── community-map-detail-v1.png  # 圣灯片区独立高精艺术层
        ├── community-map-detail-v1.webp # 高精层运行时优化格式
        ├── community-map-service-center-v1.{png,webp} # 服务中心分区
        └── community-map-{public-square,learning-room,tool-house,
            tea-courtyard,skills-workshop,riverside-volunteers}-v1.{png,webp}
            # 其余六个场所原稿与按需加载格式
```

## 运行

HLC 仍是独立 Deno 项目，当前未接入 OpenFX 的 Deno workspace。

```bash
cd domains/hlc
deno run --no-config -A --unstable-kv index.js
```

默认监听：

```text
http://localhost:8000/
```

重新打包浏览器脚本：

```bash
cd domains/hlc
deno run --no-config -A handle.ts
```

使用已下载的 Overpass JSON 刷新离线场景：

```bash
cd domains/hlc
deno run --no-config -A tools/build-yongchang-scene.ts \
  --input=/absolute/path/to/osm.json --date=YYYY-MM-DD
```

把后续审定的圈选文件更新为前端运行时模块：

```bash
cd domains/hlc
deno run --no-config -A tools/build-shengdeng-focus-data.ts \
  --input=/absolute/path/to/shengdeng-focus.geojson
```

## 可提炼模式

- `encoder` / `deliver`：类型感知序列化，支持 Blob、Map、Set、TypedArray、BigInt
  和 `Deno.KvU64`。
- `.hlc` 内容寻址文件仓库：SHA-256 文件名、本地 `.files` 存储和云端 `file0`
  适配。
- 本地/Deno Deploy 双运行模式：通过 `DENO_REGION` 在本地 KV 文件和云端 KV
  之间切换。
- WebSocket `socket.reply()`：请求/响应式消息与 `randomStamp` 回执模式。

这些模式本次只做标注，不立即抽到
`domains/_shared/`，避免把遗留项目迁移扩大成重构。

## 安全风险

HLC 作为 legacy domain 保留，运行公网服务前需要先处理以下问题：

- `/fetchUrl` 可请求任意远端 URL，存在 SSRF 风险。
- 上传文件没有尺寸、类型和配额限制。

Phase 15 已移除 `ADMIN_KEY` 的代码内默认值和 `/login` 隐藏管理命令，并限制
`/files/<name>` 只能读取 SHA-256 命名的 `.hlc` 文件。`ADMIN_KEY`
仅保留为旧部署创建首个管理员时的 兼容密码来源；完成迁移后应移除该环境变量。

## 验证状态

并入后已在 `domains/hlc` 内用以下命令启动并验证根页面、脚本、样式和 `/intro` KV
接口：

```bash
deno run -A --unstable-kv index.js
```

当前 legacy JavaScript 入口不通过
`deno check --no-config --unstable-kv --check-js index.js`： 主要问题是隐式
`any`、FormData/File 类型收窄、动态扩展 WebSocket
属性，以及旧第三方库类型不匹配。 因此 OpenFX 根级校验排除
`domains/hlc/`，后续若要产品化，应先拆分并类型化服务端模块。

## 迁移边界

本次迁移只做源码归档和价值标注：

- 保留原 Deno 单服务、静态 HTML/CSS 和打包后的 `main.js`。
- 不迁入旧项目的 `.git`、`.files`、`.DS_Store`、`node_modules` 或本地缓存。
- 不把 HLC 立即改造成 OpenFX Web 源码的一部分。
- OpenFX 根级 Deno 校验排除 `domains/hlc/`，避免误处理遗留 JavaScript 项目。
