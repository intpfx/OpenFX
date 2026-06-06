# Finlyzer

> 本地优先账单分析器 · Electron + React + Vite · v1.0.0

Finlyzer 用于整理个人或小型业务场景下的支付宝、微信和已支持银行账单导出数据。应用围绕一张主交易表展开：导入、分类、检查镜像关系、复核承诺结转，并完成图表分析，全程不依赖远端服务器。

## 并入 OpenFX

本 domain 从独立仓库 `intpfx/Finlyzer` 迁入 OpenFX，并保留原项目结构：

- 本地项目：`/Users/siaovon/Documents/Projects/Finlyzer`
- 云端仓库：`https://github.com/intpfx/Finlyzer`
- 对齐提交：`1eff5fcb0b708ae9ca971a426b47c30dd8cb5ef3`
- 对齐时间：2026-06-05

并入前已通过只读远端查询确认：GitHub `main`、本地 `main`、本地 `origin/main` 和 `HEAD`
均指向同一提交。

## 当前能力

- 导入支付宝、微信 CSV 账单，以及当前已适配的银行账单工作簿。
- 自动识别导入数据来源格式。
- 通过 Dexie 将交易、分类树、导入任务和 UI 元信息存储在本地 IndexedDB。
- 支持主表内方向感知分类、镜像分组、承诺记录和人工结转确认。
- 内置趋势图、分类分布图、统一日历热力图和分类 x 时间矩阵图。
- 支持 JSON 备份导出和完整恢复。

## 结构

```text
domains/finlyzer/
├── electron/             # Electron 主进程和 preload
├── public/               # 源静态资源 + OpenFX 静态构建产物
│   └── finlyzer/         # OpenFX iframe 入口
├── scripts/              # 图标与 release 清理脚本
├── src/                  # React/Vite 渲染端
├── package.json
├── pnpm-lock.yaml
└── vite.config.ts
```

## 运行

Finlyzer 仍是独立 Electron/Vite 应用，当前未接入 OpenFX 的 Deno workspace。

```bash
cd domains/finlyzer
pnpm install
pnpm dev
```

构建渲染端并更新 OpenFX 静态入口：

```bash
pnpm build
```

构建产物会输出到 `public/finlyzer/`，由 OpenFX Nitro `publicAssets` 服务。OpenFX 首页卡片使用
`/finlyzer/index.html` iframe 打开静态版本。

## 发布

保留原 Electron 发布脚本：

```bash
pnpm dist
```

最终 Windows portable 产物输出到 `release/`，该目录不进入 OpenFX 源码归档。

## 迁移边界

本次迁移只做版本一致性确认、源码归档和 OpenFX 静态入口接入：

- 保留原 Electron/Vite/PNPM 工程结构。
- 不迁入旧项目的 `.git`、`node_modules`、`dist`、`release` 或本地系统文件。
- 不把 Finlyzer 立即改造成 Perry 桌面应用；Electron 壳作为旧项目事实状态保留。
- OpenFX 根级 Deno 校验排除 `domains/finlyzer/`，避免误处理独立 Vite/PNPM 项目。
