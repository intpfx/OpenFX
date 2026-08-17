# dsh-conversation-browser

在 DeepSeek Harness 会话区域注册“浏览器”视图，默认位于“轨迹”右侧。每个会话拥有独立的地址、历史位置和刷新版本；网页在不启用 `allow-same-origin` 的沙箱 iframe 中打开。

```sh
dsh plugin --profile web add dsh-conversation-browser
```

## 行为

- 接受 `https://`、`http://`、域名和本机开发地址；域名默认补全为 HTTPS，本机地址默认补全为 HTTP；
- 拒绝带用户名/密码的 URL、`javascript:`、`file:` 和其他非 HTTP(S) 协议；
- 后退、前进和刷新由插件自己的会话级历史管理；
- 不提供“在新标签页打开”，避免把沙箱内页面提升到宿主浏览器权限；
- 宿主提供 `data-conversation-input-header` 时，地址栏位于搜索框和消息输入框之间；旧宿主自动使用浏览器内容顶部的紧凑地址栏。

部分网站通过 `X-Frame-Options` 或 CSP 禁止嵌入，此时浏览器视图无法绕过网站策略。iframe 不共享宿主登录态，也不能访问宿主页面 DOM。

本包由 DeepSeek Harness 的实验性 `ui-browser` 实现迁出并继续维护，保留原始 MIT 授权声明。
