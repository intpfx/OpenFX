# 工程计价助手

工程计价助手是一个云端静态工程计价工具。

它从旧本地项目迁入。原项目不是 git 仓库，也没有发现后端、部署配置、云同步或与“工程计价助手”匹配的公开云端版本；当前形态是纯前端 Vite + React 工具。

## 目录

```text
app/                         原始 Vite + React 源码，排除 node_modules 和构建缓存
public/costing-assistant/    已构建静态产物，由 OpenFX Nitro publicAssets 服务
```

## 运行方式

OpenFX Web 入口会通过首页卡片打开 `/costing-assistant/index.html`。

工程计价助手在浏览器本地处理 Excel 导入、字典匹配、计价计算、OCR 辅助导入和 Excel 导出。数据持久化使用 `localStorage`，不会上传到 OpenFX 服务端。

## 后续维护

如需重新生成静态产物：

```bash
cd domains/costing-assistant/app
bun install
bun run build
```

构建后将 `app/dist/` 同步到 `public/costing-assistant/`。`vite.config.ts` 已设置 `base: "./"`，避免静态资源在 OpenFX 子路径下解析到根 `/assets/`。
