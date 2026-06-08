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
