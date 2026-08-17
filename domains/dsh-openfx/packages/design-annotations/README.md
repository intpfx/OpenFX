# dsh-design-annotations

为 DeepSeek Harness Web 提供 `/design` 设计批注：圈选页面元素、保存文字批注、删除或清空标记，并把未发送批注作为一条消息交给当前会话。

```sh
dsh plugin --profile web add dsh-design-annotations
```

使用方法：在输入框调用 `/design`，选择开启批注；点击目标元素后输入说明，按 `Ctrl/⌘ + Enter` 保存；再次调用 `/design` 可发送或管理批注。数据保存在当前浏览器的 `localStorage['dsh-design-annotations-notes']`，不会自动上传。

本包只在用户明确选择“发送”时写入当前会话。清除站点数据会删除本地批注。
