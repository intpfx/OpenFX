# LivpExplorer

> OpenFX domain import notes for the ChronoFrame codebase and the retired local
> LivpExplorer prototype.

## 并入 OpenFX

本 domain 以 ChronoFrame 上游源码为基线，并在 OpenFX 中更名为 `LivpExplorer`：

- 上游仓库：`https://github.com/HoshinoSuzumi/chronoframe`
- 上游版本：`v1.0.0-rc.3`
- 上游提交：`2463660a0d3b0efc5118d21f3163ac7e6553cc9c`
- tag object：`c12600ae16c817c78c07ac8af29a2b8e8ee8e193`
- 原 fork：`https://github.com/intpfx/chronoframe`（本次删除）
- 原本地项目：`/Users/siaovon/Documents/Projects/LivpExplorer`（本次删除）
- 并入时间：2026-06-06

导入方式是从上游 tag clone 后用 `git archive` 写入 `domains/LivpExplorer/`。本目录不包含上游
`.git/`，也不追随上游 `main` 的后续提交；后续升级应显式选择 tag 或 commit。

目录名称按用户要求使用 `LivpExplorer`，但源码内部品牌仍保留 ChronoFrame。后续如果要产品化为
OpenFX 的 LivpExplorer，应先决定是否只改部署名称，还是连 UI 文案、环境变量和文档品牌一起迁移。

## 当前能力

ChronoFrame 是完整的自托管照片库应用，而不是单纯的 Live Photo 导出器：

- Nuxt 4 + Vue + TypeScript + TailwindCSS 应用，Nitro preset 为 `node_server`。
- Web 后台支持照片上传、相册、队列、设置、日志和存储配置。
- 服务器处理 EXIF、缩略图、ThumbHash、HEIC/HEIF 转 JPEG、地理位置解析和反向地理编码。
- 存储后端支持 local、S3-compatible storage 和 OpenList。
- Live Photo 支持两条路径：
  - 独立同名 MOV/MP4 与 HEIC/JPG/JPEG 图片配对。
  - Motion Photo XMP 中嵌入的 MP4 片段提取。
- 前端 viewer 支持 Live Photo 标记、视频播放、缩放、EXIF 信息面板、分享和 reaction。
- 包含 Dockerfile、docker-compose、VitePress 文档、SQLite/Drizzle schema 和迁移。

## 运行边界

本 domain 保留为独立 Nuxt/pnpm workspace，不并入 OpenFX 根 VitePlus + React + Nitro 应用。

```bash
cd domains/LivpExplorer
pnpm install --frozen-lockfile
pnpm dev
```

生产部署优先使用该项目自带 Dockerfile 或上游镜像流程。OpenFX 根级 Deno 校验排除
`domains/LivpExplorer/`，避免误处理 Nuxt、pnpm lockfile、Node native dependencies 和 server
runtime。

## 旧 LivpExplorer 原型的可吸收功能

旧本地项目是 SwiftUI / Photos / StoreKit 原型，目标是从 Apple Photos Library 读取 Live Photos
并导出 `.livp` 文件。它没有迁入源码，因为当前本地项目构建失败，且核心打包实现还未收口：

- `Views/RootView.swift` 内容被 Xcode project 文件覆盖，`xcodebuild` 会把 pbxproj 当 Swift 编译。
- `LIVPPackager` 创建 archive 后未调用 `write()`。
- 打包器写入 `<fileName>.heic` / `<fileName>.mov`，读取器期待 `live.heic` / `live.mov`。
- Quick Look 和 thumbnail provider 文件存在，但 Xcode project 里没有对应 extension target。

尽管如此，旧项目有几条值得纳入 LivpExplorer 后续路线的能力：

1. Apple Photos 原生导入
   - 用 `PHPhotoLibrary` 请求相册权限。
   - 用 `PHAsset.mediaSubtypes.contains(.photoLive)` 扫描系统 Live Photos。
   - 用 `PHAssetResource.assetResources(for:)` 提取 `.photo` 和 `.pairedVideo`。
   - 作为后续 macOS/iOS helper 或桌面端导入器，比 Web 上传更适合批量读取本机照片库。

2. `.livp` 单文件归档
   - 旧原型设想 `.livp` 为 ZIP，包含 `live.heic`、`live.mov` 和 `metadata.json`。
   - OpenFX 现有 `domains/_shared/livp-codec.ts` 是另一种二进制格式。后续必须先定一个
     canonical LIVP format，再决定兼容 ZIP、二进制容器，还是两者都支持。
   - ChronoFrame 当前是拆分存储图片、视频、缩略图和数据库 metadata；可增加 `.livp` 导入/导出 API，
     但不应破坏现有 split-storage 模型。

3. 原生 Quick Look / thumbnail
   - `.livp` 若作为用户可下载归档文件，macOS/iOS Quick Look 预览和 thumbnail extension 有产品价值。
   - 可作为独立 Apple 平台 companion app，而不是直接混入 Nuxt server。

4. 导出队列与历史记录
   - Swift 原型已有 `ExportJob`、进度、取消和导出历史方向。
   - ChronoFrame 已有服务器 pipeline queue；后续可以把 `.livp` 导入/导出纳入同一队列模型。

5. StoreKit 订阅不是当前 OpenFX 优先项
   - 原型里的 StoreKit 2 多选导出限制属于 App Store 商业化外壳。
   - 自托管 Web domain 默认不引入订阅限制；如做 companion app，再单独评估。

## 后续建议

- 先给 ChronoFrame 增加 `.livp` ZIP import spike：上传 `.livp` -> 解压 -> 建立 photo + video pair。
- 再决定是否把 `_shared/livp-codec.ts` 改为兼容 ZIP，或保留二进制容器并另写 ZIP reader。
- 如果要恢复 Apple Photos 原生能力，重新创建干净 SwiftUI companion app，保留 Photos/QuickLook 思路，
  不复用当前破损项目文件。
- 若要在 OpenFX 首页展示该 domain，优先提供一个外链/独立服务入口，不把 Nuxt app 静态塞进
  `entry/web`。
