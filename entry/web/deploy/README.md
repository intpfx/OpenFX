# OpenFX Web Deployment

原始的服务端脚本逻辑现在已经迁移到 `entry/web`：

- `mapping-gateway.ts` 对应 Web 路由 `POST /update`、`GET /update`、`GET /:key/*`
- `http-relay.ts` 对应可选 Web 路由 `/api/proxy/*`（仅在配置 `OPENFX_PROXY_UPSTREAM`
  后启用）

## Deno Deploy deployment notes

- 服务端构建入口是 `entry/web/nitro.config.ts`
- 客户端构建入口是 `entry/web/index.html`
- 推荐在 Deno Deploy 中把应用指向本仓库根目录，并使用
  `deno task --config entry/web/deno.json build` 作为构建命令
- 当前产物入口是 `entry/web/.output/server/index.ts`
- 如果需要持久化 DownIP 映射，请为应用关联 Deno KV
- 如果需要代理功能，请设置环境变量 `OPENFX_PROXY_UPSTREAM`
- 可选环境变量：`DOWNIP_REDIRECT_SCHEME`、`DOWNIP_REDIRECT_PORT`
- Web 构建脚本会注入 `VITE_OPENFX_BUILD_TIME` 和
  `VITE_OPENFX_BUILD_HASH`，用于页脚展示构建时间和短哈希；Deno Deploy 自己重新构建时也会
  走同一套元数据生成逻辑。

## Deno Deploy console template

推荐按下面这组值填写：

- Repository root / Application directory: 仓库根目录 `/`
- Install command: 留空
- Build command: `deno task --config entry/web/deno.json build`
- Entrypoint: `entry/web/.output/server/index.ts`
- Production branch: `main`

如果你的 Deno Deploy 项目界面强制要求单独选择 Web 目录，也可以改成：

- Application directory: `entry/web`
- Install command: 留空
- Build command: `deno task build`
- Entrypoint: `.output/server/index.ts`

当前仓库已经切到 Deno 统一管理依赖，Web 构建不再依赖 `pnpm install`。

## Runtime behavior

- DownIP 功能默认可用
- Proxy 功能默认关闭，避免开放代理风险
