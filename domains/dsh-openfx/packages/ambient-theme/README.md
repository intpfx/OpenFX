# dsh-ambient-theme

为 DeepSeek Harness Web 提供低干扰的流体极光、指针响应粒子网格和鲸鱼点云背景。背景不接管点击事件，深浅主题自动切换，系统启用“减少动态效果”时只绘制静态帧。

```sh
dsh plugin --profile web add dsh-ambient-theme
```

本包只负责视觉背景和输入卡透明度，不改变工作区导航、会话状态或模型请求。实现位于 `src/client.js`，构建产物通过 DSH 的客户端模块加载器挂载。

限制：WebGL 不可用时流体层会停用，DOM 与输入仍可正常使用；点云鲸鱼使用包内 SVG，不请求外部资源。
