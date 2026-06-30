# Map Poster

从 OpenStreetMap 数据生成极简风格的城市地图海报（SVG/PNG）。

## 来源与 OpenFX 改造

本项目基于 MIT License 的
[originalankur/maptoposter](https://github.com/originalankur/maptoposter) 改造。

OpenFX 版保留了原项目的核心产品方向：使用 OpenStreetMap 数据生成多主题城市地图海报。
主要改动是：

- 将原 Python/uv CLI 思路移植为 TypeScript/Deno 代码，并接入 OpenFX Web 的 Nitro
  服务端。
- 重做 SVG 渲染链路、主题类型、数据裁剪和浏览器预览下载。
- 在 Web 端增加地图点选中心点，不再要求用户通过城市预设或手动填写坐标来取点。

与原项目的区别：

- 原项目偏命令行生成器，入口是 `create_map_poster.py`。
- OpenFX 版偏 Web 交互工具，入口是首页 Map Poster 卡片和 `POST /api/map-poster/render`。
- 原项目使用 Python 生态、OSMnx 和 matplotlib；OpenFX 版使用 Deno/Nitro、Overpass
  数据和自有 SVG renderer。

## 快速开始

```bash
bun run src/cli.ts --city Tokyo --country Japan
bun run src/cli.ts --city "New York" --country "USA" --theme midnight_blue
bun run src/cli.ts --list-themes
```

## Web 入口

OpenFX Web 首页的 Map Poster
卡片提供交互式生成器：用户可以在地图上选择中心点，再调整标题、主题、画幅和地图范围，
在线预览生成结果，并下载 SVG 或 PNG。

## 参数

| 参数             | 说明              | 默认         |
| ---------------- | ----------------- | ------------ |
| `--city, -c`     | 城市名（必填）    | -            |
| `--country, -C`  | 国家名（必填）    | -            |
| `--theme, -t`    | 主题              | `terracotta` |
| `--distance, -d` | 地图半径（米）    | 15000        |
| `--width, -W`    | 宽度（英寸）      | 12           |
| `--height, -H`   | 高度（英寸）      | 16           |
| `--format, -f`   | 输出格式: svg/png | svg          |
| `--lat, --lon`   | 直接指定经纬度    | 自动 geocode |
| `--list-themes`  | 列出所有主题      | -            |

## 主题

内置 17 个主题：`terracotta`, `midnight_blue`, `noir`, `neon_cyberpunk`, `japanese_ink`,
`emerald`, `sunset`, `ocean`, `autumn`, `forest`, `blueprint`, `copper_patina`,
`warm_beige`, `monochrome_blue`, `pastel_dream`, `contrast_zones`, `gradient_roads`

## 架构

```
src/cli.ts          CLI 入口
src/geocoding.ts    Nominatim 地理编码（带文件缓存）
src/overpass.ts     Overpass API 数据获取
src/renderer.ts     SVG 渲染引擎
src/themes.ts       主题定义
```

### 数据流

1. **Geocoding** — 城市名 → 经纬度（缓存到 `cache/geocoding.json`）
2. **Overpass API** — 一次查询获取路网 + 水系 + 绿地（`out geom` 模式）
3. **投影** — 以城市中心为原点的本地米制投影，并按海报宽高比裁切
4. **SVG 构建** — 六层叠加：背景 → 水系面 → 绿地面 → 道路纹理（按等级分组）→ 上下渐隐 →
   文字
5. **输出** — 以 300 DPI 像素尺寸生成 SVG，或通过 sharp 转 PNG 并写入 300 DPI 元数据

## 视觉基准

默认 12 × 16 英寸输出对应 3600 × 4800 像素。调主题或渲染逻辑时，建议至少重新生成 Tokyo /
New York / Venice / Dubai / Barcelona 这几类城市样张，覆盖密集路网、网格路网、
水系/海岸线和暗色主题。

## 依赖

- **Bun** — 运行时
- **sharp**（可选）— PNG 输出

## 输出

海报文件保存在 `posters/` 目录，命名格式：`{city}_{theme}_{date}.svg`。
