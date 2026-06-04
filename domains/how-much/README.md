# how-much

`how-much` 来自原 `how-much-this` 商品价格比较应用。它通过中国地图展示不同地区的商品价格
差异，让用户搜索商品、上传本地价格、查看地区价格统计，并报告不准确的数据。

在 OpenFX 中，它被拆成一个 domain：产品交互和静态 Web Components 保留在
`domains/how-much/public/`，可测试的校验、统计和存储逻辑进入 `core/` 与 `server/`，Nitro
API 路由只负责装配。

## 功能特点

- **价格地图显示**：通过中国地图直观展示不同地区的商品价格差异，使用颜色渐变表示价格高低。
- **商品搜索**：支持按商品名查询全国范围内的价格数据。
- **价格上传**：用户可以为指定地区提交最新价格和备注。
- **价格统计分析**：按地区展示价格记录，并计算可参与统计的城市均价。
- **价格趋势图表**：前端 Web Component 使用 D3.js 展示价格变化。
- **数据质量控制**：用户可以报告不准确价格；达到阈值后，该数据不再参与均价计算。
- **地理位置识别**：通过坐标反查中文地区候选，方便上传本地价格。

## 技术栈

- **前端**：原生 JavaScript、Web Components、D3.js、TopoJSON 矢量地图。
- **后端**：Nitro/H3 API 路由装配，domain server 模块提供存储和地理编码。
- **存储**：优先使用 OpenFX 统一 scoped Deno KV，不可用时降级到内存 store。
- **外部 API**：OpenStreetMap Nominatim reverse geocoding。

## 目录结构

```text
core/
  types.ts        # 上传、记录、城市聚合与颜色映射类型
  validation.ts   # 上传与举报参数校验
  statistics.ts   # 城市分组、均价、颜色映射
server/
  geocode.ts      # Nominatim 反向地理编码
  store.ts        # Deno KV / memory store
public/
  how-much/
    dynamic-capsule.js  # 搜索、上传、详情、举报和状态转换
    vector-map.js       # 中国地图渲染、区域交互和着色
    map.topo.json       # 地图数据
    index.html          # 独立页面入口
```

## 组件结构

### `vector-map`

负责地图渲染和区域交互：

- 加载并显示 TopoJSON 地图数据。
- 根据价格数据为地图区域着色。
- 处理地图点击、选择和缩放。
- 与 `dynamic-capsule` 通信，展示区域价格详情。

### `dynamic-capsule`

负责主要用户界面和交互状态：

- 提供搜索、结果显示、价格上传、价格浮窗等视图状态。
- 调用后端 API 读写价格数据。
- 渲染价格统计和趋势图表。
- 管理上传成功、上传失败、举报成功、举报失败等通知状态。
- 支持平滑视图过渡动画。

## API 装配

原仓库 API 是 `/api/search`、`/api/suggestions`、`/api/upload`、`/api/location` 和
`/api/report`。迁入 OpenFX 后，为避免和其他产品冲突，统一加上 `/api/how-much` 前缀：

| OpenFX 路径                 | 原路径             | 方法   | 说明                                     |
| --------------------------- | ------------------ | ------ | ---------------------------------------- |
| `/api/how-much/search`      | `/api/search`      | `GET`  | 按商品名查询记录，并返回城市价格地图数据 |
| `/api/how-much/suggestions` | `/api/suggestions` | `GET`  | 返回商品名建议                           |
| `/api/how-much/upload`      | `/api/upload`      | `POST` | 上传商品价格、位置和可选备注             |
| `/api/how-much/location`    | `/api/location`    | `POST` | 根据经纬度返回地区候选                   |
| `/api/how-much/report`      | `/api/report`      | `POST` | 举报某条价格记录                         |

Nitro API 路由位于 `entry/web/server/routes/api/how-much/`，通过本 domain 的 core 和
server 模块装配。

## 数据结构

价格记录在业务层使用以下结构：

```ts
interface ProductEntry {
  productName: string;
  price: number;
  location: string;
  reportCount: number;
  note: string;
  timestamp: string;
}
```

上传接口接收：

```ts
interface UploadPayload {
  productName: string;
  price: number;
  location: string;
  note?: string;
}
```

## 存储

`getHowMuchStore()` 优先使用 `_shared` 的 scoped KV：

```text
["domains", "how-much", <productName>, <timestamp>]
["domains", "how-much", "index", "productName"]
```

当 Deno KV 不可用时，自动降级为内存 store。内存 store 只适合本地开发和测试，进程重启后
数据会丢失。

## 功能流程

1. **搜索流程**
   - 用户输入商品名称。
   - 系统返回匹配的产品价格数据。
   - `core/statistics.ts` 按地区计算均价并生成地图颜色数据。
   - 前端地图显示全国价格差异。

2. **上传价格流程**
   - 用户打开上传表单。
   - 输入价格、位置和可选备注。
   - API 校验 payload 后写入 store，并更新商品名建议索引。

3. **价格详情查看**
   - 用户点击地图区域。
   - 前端展示该地区价格记录、统计信息和价格趋势。

4. **数据质量控制**
   - 用户可以报告不准确的价格。
   - `REPORT_THRESHOLD` 当前为 `5`。
   - 举报数达到阈值后，该记录不再参与均价计算，但前端仍可展示其状态。

## 统计规则

- `computeCityPrices()` 从 `location` 中提取城市 key，并按城市收集价格记录。
- `computeCityAverages()` 排除举报数达到阈值的记录后计算均价。
- `computeColorMapping()` 根据城市均价生成 HSL 颜色和归一化值。

## 地理位置与隐私

`reverseGeocode()` 使用 OpenStreetMap Nominatim reverse geocoding 接口，并设置
`accept-language=zh-CN`。请求失败或没有有效结果时返回 `["未知地区"]`。

- 地理位置信息仅用于定位用户当前城市，方便上传本地价格。
- 如果用户拒绝地理位置权限，前端应走降级路径或让用户手动输入位置。
- 用户上传的价格数据不包含个人身份信息。

## 移动端与浏览器

原交互设计支持响应式布局和触摸操作：竖屏时操作界面偏底部，横屏时操作界面偏侧边；地图支持
缩放和区域选择。现代浏览器可使用 CSS View Transitions API 获得更平滑的状态切换，不支持时
应保持可用的降级体验。

## 开发原则

- `core/` 保持纯函数，方便后续补测试。
- API 路由只负责 Nitro/H3 装配，不应复制 domain 校验和统计逻辑。
- 静态 Web Components 调用的是 OpenFX 前缀后的 API，不要回退到原仓库的裸 `/api/*` 路径。
- 涉及数据结构变更时，需要同时检查 KV key、内存 store、API 路由和前端静态组件。

## 验证

当前本 domain 尚未有独立测试文件。修改业务逻辑后应至少运行：

```bash
deno task check
```

修改统计、校验或 store 行为时，建议补充对应 Deno 测试。
