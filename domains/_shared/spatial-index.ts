/**
 * spatial-index — 纯函数空间索引工具
 *
 * 零依赖（rbush 类型仅作为可选类型声明）。不含 Canvas 绘图逻辑。
 * 所有函数均为纯函数，不访问全局状态、文件系统或网络。
 */

// ── 类型定义 ───────────────────────────────────────────────────────

/** 地理坐标点 [经度, 纬度]（longitude, latitude），经度范围 [-180, 180]，纬度范围 [-90, 90] */
export type Point = [number, number];

/** RBush 兼容的索引条目 —— 除 bbox 外携带经纬度原始值 */
export interface RBushItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  lat: number;
  lon: number;
  data?: unknown;
}

/** RBush 需要的 bbox 搜索参数 */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * RBush 的最小接口 —— 任何满足该接口的 R-Tree 实现均可使用。
 * 若你使用 npm:rbush，它天然满足此接口。
 */
export interface RBushLike {
  search(bbox: BBox): RBushItem[];
  insert(item: RBushItem): RBushLike;
  remove(item: RBushItem, equals?: (a: RBushItem, b: RBushItem) => boolean): RBushLike;
}

// ── 纯函数 ────────────────────────────────────────────────────────

const TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

/** 角度 → 弧度 */
function toRad(deg: number): number {
  return deg * TO_RAD;
}

/**
 * Haversine 球面距离公式。
 * 返回两点间的大圆距离，单位：公里。
 *
 * 参数顺序：`lat1, lon1, lat2, lon2`（纬度在前，与常见 GIS 库一致）。
 *
 * ```ts
 * haversineDistance(39.9042, 116.4074, 31.2304, 121.4737); // ≈ 1068 km
 * ```
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * O(n) 线性搜索最近邻。
 * 适用于少量点位（< 几千）或一次性查询。
 *
 * @param target  目标坐标 [lon, lat]
 * @param points  候选坐标列表
 * @returns 距离目标最近的点；若列表为空则返回 null
 */
export function findNearestLinear(
  target: Point,
  points: readonly Point[],
): Point | null {
  if (points.length === 0) return null;

  const [targetLon, targetLat] = target;

  let bestPoint: Point = points[0];
  let bestDist = haversineDistance(targetLat, targetLon, bestPoint[1], bestPoint[0]);

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const d = haversineDistance(targetLat, targetLon, p[1], p[0]);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = p;
    }
  }

  return bestPoint;
}

/**
 * R-tree 索引最近邻搜索。
 *
 * 从 bbox 半径 r 开始尝试搜索；若 bbox 内无候选则扩大半径重试。
 * 候选集内使用 Haversine 距离精排。
 *
 * @param lat   目标纬度
 * @param lon   目标经度
 * @param tree  RBush 实例（或满足 RBushLike 接口的任意 R-Tree）
 * @returns 最近的点 [lon, lat]；若树为空则返回 null
 */
export function findNearestRTree(
  lat: number,
  lon: number,
  tree: RBushLike,
): Point | null {
  // 初始搜索半径（度数）；每次扩大 1°
  let radius = 1;
  // 防止死循环的安全上限（地球半圈 ≈ 180°）
  const MAX_RADIUS = 180;

  while (radius <= MAX_RADIUS) {
    const bbox: BBox = {
      minX: lon - radius,
      minY: lat - radius,
      maxX: lon + radius,
      maxY: lat + radius,
    };

    const candidates = tree.search(bbox);

    if (candidates.length > 0) {
      let nearest = candidates[0];
      let minDist = haversineDistance(lat, lon, nearest.lat, nearest.lon);

      for (let i = 1; i < candidates.length; i++) {
        const d = haversineDistance(lat, lon, candidates[i].lat, candidates[i].lon);
        if (d < minDist) {
          minDist = d;
          nearest = candidates[i];
        }
      }

      return [nearest.lon, nearest.lat];
    }

    radius += 1;
  }

  return null;
}

/**
 * 将 [lon, lat] 坐标包装为 RBush 索引条目。
 *
 * ```ts
 * const item = createRBushItem([116.4074, 39.9042]);
 * tree.insert(item);
 * ```
 */
export function createRBushItem(point: Point): RBushItem {
  const [lon, lat] = point;
  return {
    minX: lon,
    minY: lat,
    maxX: lon,
    maxY: lat,
    lat,
    lon,
    data: null,
  };
}

/**
 * 随机生成一个合法经纬度坐标，用于测试。
 *
 * ```ts
 * const [lon, lat] = randomGeolocation();
 * // lon ∈ [-180, 180], lat ∈ [-90, 90]
 * ```
 */
export function randomGeolocation(): Point {
  const lon = Math.random() * 360 - 180;
  const lat = Math.random() * 180 - 90;
  return [lon, lat];
}
