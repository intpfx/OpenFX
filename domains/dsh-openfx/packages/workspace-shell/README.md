# dsh-workspace-shell

把 DeepSeek Harness Web 的工作区和会话导航整理为双行顶部标签栏，并提供输入区搜索、设置与统计重定位，以及窄屏双行导航和底部输入卡。

```sh
dsh plugin --profile web add dsh-workspace-shell
```

本包不创建会话、余额或浏览器状态，只重用宿主已有控件和状态。安装 `dsh-usage-balance` 时，它会通过稳定的 `data-usage-balance-*` 展示属性把工作区成本和可用余额放入紧凑布局；未安装时对应位置保持为空。

当前实现面向 DSH Web 的 DOM 席位和公开 `data-*` 标记。宿主大版本升级后应重新执行桌面、窄屏和输入区的浏览器验收。
