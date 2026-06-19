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

- `entry/web/src/App.tsx` 的 `ActiveDomainPanel` 类型
- `getProjectCardClick()` 的可点击项目映射
- `Homepage` 内对应的 `activePanel === "<project-id>"` 渲染分支

不要只在 JSON
里新增卡片。没有详情内容的卡片会让首页项目浏览器出现断点，后续维护时应优先补齐说明面板、嵌入页面或外部安装/访问入口。

`entry/web/tests/homepage-projects.test.ts` 会校验 JSON 卡片 ID 与详情面板 ID
完全一致，新增卡片后需要让 `deno task check` 继续通过。

## 部署目标

默认部署目标是 Deno Deploy，由 Nitro 输出服务端入口并由 VitePlus 构建 SPA 客户端。

## 已托管在 `apps/web` 中的服务端能力

- DownIP 更新接口：`POST /update`
- DownIP 映射查询接口：`GET /update`
- DownIP 重定向接口：`GET /:key/*`
- 可选代理接口：`GET|POST|PUT|PATCH|DELETE /api/proxy/*`

### 环境变量

- `DOWNIP_REDIRECT_SCHEME` — 重定向协议，默认 `http`
- `DOWNIP_REDIRECT_PORT` — 可选的全局重定向端口覆盖值
- `OPENFX_PROXY_UPSTREAM` — 设置后启用可选代理路由
