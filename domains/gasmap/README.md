# GasMap

> 燃气工程单线图绘制与统计工具 · React + Vite · v2.6.10

GasMap 是燃气工程设计的移动端友好单线绘制工具，支持快速布置管线、插入设备并导出工程统计。

## 并入 OpenFX

本 domain 从独立仓库 `intpfx/GasMap` 迁入 OpenFX，并保留原项目结构：

- 本地项目：`/Users/siaovon/Documents/Projects/GasMap`
- 云端仓库：`https://github.com/intpfx/GasMap`
- 对齐提交：`f810b7960b2702f7e674150bcbc56bd7908a6fe4`
- 对齐时间：2026-06-05

并入前已通过只读远端查询确认：GitHub `main`、本地 `main`、本地 `origin/main` 和 `HEAD`
均指向同一提交。

## 功能

- 管线绘制与延长：方向选择、材质直径联动、端点冲突规避。
- 设备与管件管理：法兰阀、球阀、调压箱、物联网表、立柱等布置与统计。
- 统计导出：管材长度、管件清单与配件数量导出。
- 项目持久化：本地多项目保存，支持导入和导出工程数据。
- 可选激活码服务：`server.js` 提供面向 Deno KV 的简单接口。

## 结构

```text
domains/gasmap/
├── index.html
├── package.json
├── package-lock.json
├── server.js
├── vite.config.js
├── public/
└── src/
    ├── App.jsx
    ├── components/
    ├── config/
    ├── contexts/
    ├── services/
    └── utils/
```

## 运行

GasMap 仍是独立 Vite 应用，当前未接入 OpenFX 的 Deno workspace。

```bash
cd domains/gasmap
npm install
npm run dev
```

OpenFX 首页卡片使用 `/gasmap/index.html` iframe 打开静态构建产物。更新 GasMap 前端后运行：

```bash
npm run build
```

构建产物会输出到 `public/gasmap/`，再由 OpenFX Nitro `publicAssets` 服务。

可选 KV 服务：

```bash
deno run --allow-net --allow-env --allow-read server.js
```

## 迁移边界

本次迁移只做版本一致性确认和源码归档：

- 保留原 React/Vite/NPM 工程结构。
- 不迁入旧项目的 `.git`、`node_modules`、`.nitro` 或本地系统文件。
- 不把 GasMap 立即改造成 OpenFX Web 源码的一部分，只通过 iframe 挂载静态产物。
- OpenFX 根级 Deno 校验排除 `domains/gasmap/`，避免误处理独立 Vite 项目。
