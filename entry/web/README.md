# OpenFX Web

这是 OpenFX 的 VitePlus + React + Nitro Web 端。

Web 端依赖统一由 Deno 和仓库根目录的 `deno.lock` 管理，不再依赖 `pnpm`。

## 常用命令

```bash
deno task --config entry/web/deno.json dev
deno task --config entry/web/deno.json build
deno task --config entry/web/deno.json preview
```

## 本地端口

- 前端 Vite：`http://localhost:5501`
- Nitro 服务：`http://localhost:3000`

## 首页项目卡片约束

`entry/web/content/homepage-projects.json` 里的每一张项目卡片都必须能点击打开对应内容。

新增或改名项目卡片时，需要同步更新：

- `entry/web/homepage-panels.ts` 的 `PROJECT_DETAIL_PANEL_IDS`
- `getProjectCardClick()` 的可点击项目映射
- `Homepage` 内对应的 `activePanel === "<project-id>"` 渲染分支

不要只在 JSON
里新增卡片。没有详情内容的卡片会让首页项目浏览器出现断点，后续维护时应优先补齐说明面板、嵌入页面或外部安装/访问入口。

外部 GitHub 仓库也可以作为项目卡片展示，但需要在 `sourcePath` 中标注 public / private
边界，通过 `links` 提供仓库入口，并在详情面板中说明来源、内容范围和 OpenFX
只是索引入口还是承载运行入口。

`entry/web/tests/homepage-projects.test.ts` 会校验 JSON 卡片 ID 与详情面板 ID
完全一致，新增卡片后需要让 `deno task check` 继续通过。

## 部署目标

默认部署目标是 Deno Deploy，由 Nitro 输出服务端入口并由 VitePlus 构建 SPA 客户端。

## 构建版本信息

Web 页底部会展示构建版本。`deno task build` 会自动补齐：

- `VITE_OPENFX_BUILD_TIME`：UTC 构建时间，格式为 `YYYY-MM-DDTHH:mm:ssZ`
- `VITE_OPENFX_BUILD_HASH`：当前提交的 7 位短哈希

如果 CI 或手动命令已经提供这两个变量，构建脚本会保留显式值；否则会用当前 UTC 时间和
`git rev-parse --short=7 HEAD` 生成。没有 Git 元数据时，会退回到 Deno Deploy build id
的短前缀；这些来源都不可用时才显示 `unknown`。

## 已托管在 `apps/web` 中的服务端能力

- DownIP 更新接口：`POST /update`
- DownIP 映射查询接口：`GET /update`
- DownIP 重定向接口：`GET /:key/*`
- 可选代理接口：`GET|POST|PUT|PATCH|DELETE /api/proxy/*`
- Map Poster 生成接口：`POST /api/map-poster/render`
  - 基于 `originalankur/maptoposter` 改造，Web 卡片会展示来源、OpenFX 改动和差异
  - Web 入口使用地图点选中心点，请求体优先传 `latitude` / `longitude`
  - `city` / `country` 只作为海报标题文案；未传坐标时才回退到地点解析

### 环境变量

- `DOWNIP_REDIRECT_SCHEME` — 重定向协议，默认 `http`
- `DOWNIP_REDIRECT_PORT` — 可选的全局重定向端口覆盖值
- `OPENFX_PROXY_UPSTREAM` — 设置后启用可选代理路由
