# dsh-openfx-web

OpenFX 为 DeepSeek Harness Web 提供的一键组合包。它不重复业务实现，而是按顺序装配：

![DSH OpenFX Web](https://raw.githubusercontent.com/intpfx/OpenFX/main/domains/dsh-openfx/assets/dsh-openfx-web.png)

- `dsh-usage-balance`
- `dsh-ambient-theme`
- `dsh-workspace-shell`
- `dsh-design-annotations`
- `dsh-conversation-browser`

```sh
dsh plugin --profile web add dsh-openfx-web
```

安装后重启 `dsh web`。如只需要其中一项，请直接安装对应能力包；从旧的 `dsh-harness-background` 或 `dsh-balance-sidebar` 迁移时，先移除旧 profile 依赖，避免相同 UI 同时挂载两次。

完整架构、迁移表和本地开发命令见 [套件文档](../../README.md)。
