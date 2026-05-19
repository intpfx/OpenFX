# OpenFX Web Deployment

原始的服务端脚本逻辑现在已经迁移到 `apps/web`：

- `mapping-gateway.ts` 对应 Web 路由 `POST /update`、`GET /update`、`GET /:key/*`
- `http-relay.ts` 对应可选 Web 路由 `/api/proxy/*`（仅在配置 `OPENFX_PROXY_UPSTREAM`
  后启用）

## Deno Deploy deployment notes

- 服务端构建入口是 `apps/web/nitro.config.ts`
- 客户端构建入口是 `apps/web/index.html`
- 需要在 Deno Deploy 中把应用指向本仓库，并以 `apps/web` 为 Web 应用目录
- 如果需要持久化 DownIP 映射，请为应用关联 Deno KV
- 如果需要代理功能，请设置环境变量 `OPENFX_PROXY_UPSTREAM`
- 可选环境变量：`DOWNIP_REDIRECT_SCHEME`、`DOWNIP_REDIRECT_PORT`

## Runtime behavior

- DownIP 功能默认可用
- Proxy 功能默认关闭，避免开放代理风险
