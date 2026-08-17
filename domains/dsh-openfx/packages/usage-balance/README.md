# dsh-usage-balance

为 DeepSeek Harness Web 提供用量与成本视图：同源宿主读取 DeepSeek 账户余额，客户端展示会话成本、工作区 token 热力图和汇总成本。API Key 只由宿主通过凭据引用读取，不发送给浏览器。

```sh
dsh plugin --profile web add dsh-usage-balance
```

默认配置：

```yaml
- name: dsh-usage-balance
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    baseUrl: https://api.deepseek.com
    refreshIntervalSeconds: 30
    model: auto
    enabled: true
```

服务端提供 `/api/usage-balance` 同源 JSON 路由。余额读取失败时成本估算仍可根据会话 token 使用量工作；估算值不是账单凭证。

与 `dsh-workspace-shell` 同时安装时，本包提供稳定的 `data-usage-balance-*` 展示属性，壳层据此显示紧凑余额与工作区成本。
