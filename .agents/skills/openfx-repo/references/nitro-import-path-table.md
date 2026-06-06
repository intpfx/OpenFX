# Nitro Server Route 相对 Import 路径速查表

OpenFX monorepo 经过 `apps/` → `entry/` 迁移后，`entry/web/` 内的 import 路径容易算错。Nitro dev 用 Deno 编译能容忍错误的路径（因为 Deno 的 cwd 解析恰好对上），但 Rollup build 会严格按文件位置解析，路径错误直接 build 失败。

## 修正原则

从文件目录到项目根的 `../` 数量 = 目录深度（从项目根算起）。

## 路径对照表

| 文件 | 深度 | 错误（常见旧写法） | 正确 | 目标 |
|------|------|-------------------|------|------|
| `entry/web/src/App.tsx` | 3 | `../../domains/` | `../../../domains/` | 项目根下的 domains/ |
| `entry/web/server/routes/*.ts` | 4 | `../../../domains/` | `../../../../domains/` | 项目根下的 domains/ |
| `entry/web/server/routes/[key]/[...rest].ts` | 5 | `../../../../domains/` | `../../../../../domains/` | 项目根下的 domains/ |
| `entry/web/server/routes/api/how-much/*.ts` | 6 | `../../../../domains/` | `../../../../../../domains/` | 项目根下的 domains/ |
| `entry/web/server/routes/api/proxy/[...path].ts` | 6 | `../../../../../domains/` | `../../../../../../domains/` | 项目根下的 domains/ |

## 注意

- `routes/` 下比 `src/` 多 1 层（`routes/` 在 `server/` 下，而非直接在 `web/` 下）
- `routes/[key]/` 比 `routes/` 多 1 层
- `routes/api/how-much/` 比 `routes/` 多 2 层
- `routes/api/proxy/` 比 `routes/` 多 2 层

## 根因

目录结构从 `entry/` 开始而非项目根直接展开，导致所有 `../../` 计数比直觉多 1：

```
项目根/
├── domains/
│   ├── downip/
│   ├── how-much/
│   └── proxy/
├── entry/
│   ├── web/
│   │   ├── src/          ← depth 3
│   │   └── server/
│   │       └── routes/   ← depth 4
│   └── desktop/
└── tools/
```

任何文件想引用 `domains/`，`../` 数量 = 文件深度（从项目根起算的目录层数）。
