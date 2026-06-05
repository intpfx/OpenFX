# proxy

`proxy` 是 OpenFX 的可选 HTTP 中继 domain。它支持两种模式：通过 `url` 参数代理完整
HTTP/HTTPS URL，或通过 `OPENFX_PROXY_UPSTREAM` 配置默认上游后代理相对路径。

## 当前职责

- 读取和规范化代理上游地址。
- 优先读取 `?url=<完整 URL>`，直接代理该目标。
- 根据当前请求和 rest path 构造目标 URL。
- 转发请求方法、请求体和大部分请求头。
- 重写请求 `origin` / `referer`。
- 为响应添加 CORS 头，移除 `x-frame-options` 和 iframe 阻断类 CSP。
- 在代理未配置时返回明确的 `503` JSON 响应。

## 目录结构

```text
server/
  handler.ts     # HTTP 代理：目标 URL 构造、请求转发与响应头改写
  turn-relay.ts  # TURN/STUN NAT 穿透中继服务器（提取自 SGR 框架）
```

Nitro API 路由位于 `entry/web/server/routes/api/proxy.ts` 和
`entry/web/server/routes/api/proxy/[...path].ts`，通过 `proxyRequest()` 装配本
domain。前者支持 `/api/proxy?url=<完整 URL>`，后者支持 `/api/proxy/*`。

OpenFX Web 装配层会保护 `/api/proxy/*`。权限语义是“可视即有完整使用权”：当前测试期
domain 卡片公开，因此 proxy 可直接使用；后续当该卡片重新纳入 unlock 管理后，只有能看到
`Relay Gateway` 卡片的用户才应使用该功能。

非公开模式下，除 `OPTIONS` 预检外，请求需要提供以下任一凭据：

- `x-openfx-admin-key: <admin key>`
- `x-openfx-unlock-key: <unlock key>`，且该 unlock 规则包含 `relay-proxy-gateway`
- `Authorization: Bearer <unlock key>`
- 查询参数 `?unlock_key=<unlock key>`

## 环境变量

| 变量                    | 必填 | 说明                                     |
| ----------------------- | ---- | ---------------------------------------- |
| `OPENFX_PROXY_UPSTREAM` | 否   | 代理上游地址；未带协议时默认补 `http://` |

示例：

```bash
OPENFX_PROXY_UPSTREAM=https://example.com deno task web:dev
```

## 行为

### 未配置代理

当请求没有 `url` 参数，且 `OPENFX_PROXY_UPSTREAM` 为空时，`proxyRequest()` 返回：

```json
{
  "ok": false,
  "error": "proxy_not_configured",
  "hint": "请设置 OPENFX_PROXY_UPSTREAM 环境变量后再使用 /api/proxy/*"
}
```

HTTP 状态码为 `503`。

### 完整 URL 代理

```text
/api/proxy?url=https%3A%2F%2Fexample.com%2Fdocs%3Fa%3D1
-> https://example.com/docs?a=1
```

完整 URL 只允许 `http:` 和 `https:` 协议。

代理完整 URL 时，响应会移除 `content-security-policy`、
`content-security-policy-report-only` 和 `x-frame-options`，方便首页的 Relay Gateway
面板在 iframe 中预览代理结果。

### 上游 fallback

设置 `OPENFX_PROXY_UPSTREAM=https://example.com/base` 后：

```text
/api/proxy/path?a=1
-> https://example.com/base/path?a=1

/api/proxy?url=/path?a=1
-> https://example.com/base/path?a=1
```

### OPTIONS 预检

`OPTIONS` 请求直接返回 `204`，并设置跨域允许头。

### Redirect

上游返回 `3xx` 时，当前实现会用相同状态码重定向回原请求 URL。

## 开发原则

- 本 domain 是 server-only，不应引入前端状态。
- 不要在 handler 中写死具体业务上游；通过环境变量配置。
- OpenFX 路由层负责 project access 鉴权，proxy domain 只负责代理行为。
- 修改 header、redirect 或错误响应行为时，应补充测试。

## 验证

修改代理逻辑后应至少运行：

```bash
deno test --allow-env domains/proxy/tests
deno task check
```
