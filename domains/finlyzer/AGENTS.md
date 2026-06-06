# AGENTS

本仓库是一个本地优先的 Electron 桌面应用。

## 技术栈

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- Dexie，用于本地 IndexedDB 存储
- ECharts，用于分析图表展示

## 工作规则

- 保持修改最小且聚焦。
- 保持仅浅色主题和当前线条分割式 UI 语言。
- 不要重新引入已经退役的交易对手对象体系。
- 优先保持本地优先行为；未经明确批准，不要引入远端服务或云端假设。
- 金额在解析、存储、分析和渲染链路中都保持“分”为单位的整数表示。
- 变更备份行为时，只围绕当前 schema 版本保持一致，不再扩展旧格式兼容链。

## 发布说明

- 主发布命令：`pnpm dist`
- Windows 专用打包命令：`pnpm dist:win`
- 使用镜像源的备用打包命令：`pnpm dist:win:mirror`
- 最终打包产物输出到 `release/`

## 仓库卫生

- 不要提交 `.mcp-debug-shell/`、`dist/`、`release/` 或 `node_modules/`。
- 当用户可见工作流或发布命令变化时，更新 `README.md`。
- 当仓库级协作约定发生实质变化时，更新本文件。
