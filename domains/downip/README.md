# downip

`downip` 是 OpenFX 的 IPv6 动态映射与重定向 domain。客户端上报 endpoint key、IPv6
地址和端口，服务端保存映射；访问 `/:key/*` 时按 key 重定向到对应 IPv6 服务。

## 当前职责

- 校验 endpoint key、IPv6 地址、端口和同步配置。
- 接收 `/update` 上报并写入映射。
- 查询当前映射。
- 根据存储映射构造 IPv6 redirect URL。
- 提供 Web 端说明页面组件，并在首页卡片展开后展示当前已接收映射。

## 目录结构

```text
core/
  types.ts        # DownIP 同步配置类型
  validation.ts   # IPv6、endpoint key、URL、端口等纯函数校验
server/
  handlers.ts     # /update 与 /:key/* 请求处理
  redirect.ts     # 重定向目标构造
  store.ts        # Deno KV / memory store
frontend/
  DownipPage.tsx  # Web 应用中的 DownIP 页面
tests/
  downip.test.ts  # 更新与重定向核心用例
```

## HTTP 接口

### `POST /update`

写入一个或多个 endpoint 映射。

```json
{
  "home": {
    "ipv6": "2001:db8::1",
    "port": 3000
  }
}
```

响应包含 `stored`、`rejected` 和 `count`，无效 key、IPv6 或端口会进入 `rejected`。

OpenFX Web 装配层会保护这个写入接口。请求需要提供以下任一凭据：

- `x-openfx-admin-key: <admin key>`
- `x-openfx-unlock-key: <unlock key>`，且该 unlock 规则包含 `ipv6-sync-suite`
- `Authorization: Bearer <unlock key>`
- 查询参数 `?unlock_key=<unlock key>`

### `GET /update`

返回当前全部映射：

```json
{
  "ok": true,
  "mapping": {
    "home": {
      "ipv6": "2001:db8::1",
      "port": 3000
    }
  }
}
```

OpenFX Web 装配层同样会保护这个读取接口，鉴权方式与 `POST /update` 相同。

首页中的 DownIP 卡片展开后会调用此接口，并在说明文案旁展示当前收到的 key、IPv6 和
port。当前测试期 domain 内容公开，因此无需 unlock 也能看到；后续卡片重新纳入 unlock
管理后，可见即代表可读。

### `GET /:key/*`

按 key 查找映射，并返回 `302` 到目标 IPv6 服务。查询字符串会保留。

```text
/home/dashboard?tab=overview
-> http://[2001:db8::1]:3000/dashboard?tab=overview
```

## 存储

`getDownipStore()` 优先使用 `_shared` 的 scoped KV：

```text
["domains", "downip", <key>]
```

当 Deno KV 不可用时，自动降级为内存 store。内存 store 只适合本地开发和测试，进程重启后
数据会丢失。

## 环境变量

| 变量                     | 默认值        | 说明                           |
| ------------------------ | ------------- | ------------------------------ |
| `DOWNIP_REDIRECT_SCHEME` | `http`        | 生成 redirect URL 时使用的协议 |
| `DOWNIP_REDIRECT_PORT`   | 映射里的 port | 设置后覆盖 redirect 端口       |

## 开发原则

- `core/` 只放纯函数和类型，不读取环境变量，不访问网络或存储。
- 服务端处理器接收显式注入的 `DownipStore`，方便测试。
- OpenFX 路由层负责 project access 鉴权，domain handler 保持可注入和可单测。
- 修改校验、存储或 redirect 行为时，应同步更新测试。

## 验证

```bash
deno test domains/downip/tests/downip.test.ts
deno task check
```
