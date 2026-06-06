// 统一比例策略与像素长度约束工具
// 目标：
// - 在不同工程下保持“现实长度到像素长度”的一致映射（统一比例）
// - 在绘制交互或布局阶段，确保管段像素长度处于可读范围（min/max）

/**
 * 依据一次标尺校准，估算“世界坐标单位/米”的比例
 * @param {number} worldLen 校准时在世界坐标下测得的长度（两点距离）
 * @param {number} meters 该段的真实米长度
 * @returns {number} unitsPerMeter 世界单位/米（用于把现实长度映射为当前世界坐标尺度）
 */
export function estimateUnitsPerMeter(worldLen, meters) {
  const w = Math.abs(Number(worldLen) || 0);
  const m = Math.abs(Number(meters) || 0);
  if (m <= 0) return 0;
  return w / m;
}

/**
 * 计算在当前视图缩放下，“每米对应的像素数”
 * @param {number} unitsPerMeter 世界单位/米（来自校准）
 * @param {number} viewScale 视图缩放系数（ProjectContext.scale）
 * @param {number} visualBase 基础视觉系数，CanvasView 中为 5
 * @returns {number} pixelsPerMeter 当前视图下每米对应的像素数
 */
export function pixelsPerMeter(unitsPerMeter, viewScale = 1, visualBase = 5) {
  const upm = Number(unitsPerMeter) || 0;
  const s = Number(viewScale) || 1;
  const vb = Number(visualBase) || 5;
  return upm * s * vb;
}

// Load editable defaults from JSON configuration (keeps code defaults centralised)
import scaleSettings from '../config/scaleSettings.json' with { type: "json" };

const DEFAULTS = {
  pxPerMeterBase: Number(scaleSettings?.pxPerMeterBase) || 48,
  visualBase: Number(scaleSettings?.visualBase) || 5,
  minSegmentPx: Number(scaleSettings?.minSegmentPx) || 24,
  maxSegmentPx: Number(scaleSettings?.maxSegmentPx) || 480,
  minValvePxBase: Number(scaleSettings?.minValvePxBase) || 24,
  defaultUnitsPerMeter: Number(scaleSettings?.defaultUnitsPerMeter) || 1,
};

/**
 * 现实长度（米）到像素长度
 * @param {number} meters 现实长度（米）
 * @param {number} unitsPerMeter 世界单位/米
 * @param {number} viewScale 视图缩放
 * @param {number} visualBase 基础视觉系数
 * @returns {number} 像素长度
 */
export function metersToPixels(meters, unitsPerMeter, viewScale = 1, visualBase = 5) {
  const ppm = pixelsPerMeter(unitsPerMeter, viewScale, visualBase);
  return Math.abs(Number(meters) || 0) * ppm;
}

/**
 * 世界坐标长度到像素长度（无需显式单位换算）
 * @param {number} worldLen 世界坐标长度（两点距离）
 * @param {number} viewScale 视图缩放
 * @param {number} visualBase 基础视觉系数
 * @returns {number} 像素长度
 */
export function worldToPixels(worldLen, viewScale = 1, visualBase = 5) {
  const s = Number(viewScale) || 1;
  const vb = Number(visualBase) || 5;
  return Math.abs(Number(worldLen) || 0) * s * vb;
}

/**
 * 对像素长度执行范围约束
 * @param {number} pxLen 像素长度
 * @param {number} minPx 最小像素长度（可读性下限）
 * @param {number} maxPx 最大像素长度（版式美观上限）
 * @returns {{status: 'ok'|'short'|'long', clamped: number}} 状态与截断值
 */
export function clampPixelLength(pxLen, minPx = DEFAULTS.minSegmentPx, maxPx = DEFAULTS.maxSegmentPx) {
  const v = Math.abs(Number(pxLen) || 0);
  const min = Number(minPx) || 0;
  const max = Number(maxPx) || min;
  if (v < min) return { status: 'short', clamped: min };
  if (v > max) return { status: 'long', clamped: max };
  return { status: 'ok', clamped: v };
}

/**
 * 为过长像素长度计算建议分段数（示意功能）
 * @param {number} pxLen 当前像素长度
 * @param {number} maxPx 上限
 * @param {boolean} preferEven 是否偏好偶数分段（视觉更整齐）
 * @returns {number} 分段数（至少 1）
 */
export function calcSubdivisionCount(pxLen, maxPx, preferEven = true) {
  const v = Math.max(0, Number(pxLen) || 0);
  const max = Math.max(1, Number(maxPx) || 1);
  let n = Math.ceil(v / max);
  if (preferEven && n > 1 && n % 2 === 1) n += 1;
  return Math.max(1, n);
}

/**
 * 在世界坐标下把一条线段按分段数均分，返回各段端点（含原起止）
 * @param {{x:number,y:number}} start 起点（世界坐标）
 * @param {{x:number,y:number}} end 终点（世界坐标）
 * @param {number} count 分段数（>=1）
 * @returns {Array<{x:number,y:number}>} 切分后的折点列表（首尾包含）
 */
export function splitSegmentWorld(start, end, count) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const pts = [];
  const dx = (end.x - start.x) / n;
  const dy = (end.y - start.y) / n;
  for (let i = 0; i <= n; i++) pts.push({ x: start.x + dx * i, y: start.y + dy * i });
  return pts;
}

/**
 * 根据当前策略与视图缩放，给出把“米长度”投影到像素后落入[min,max]的建议缩放
 * @param {number} meters 现实长度（用于观感的典型长度，如常见直管段）
 * @param {{pxPerMeterBase?:number,minSegmentPx?:number,maxSegmentPx?:number}} policy 策略
 * @param {number} currentScale 现有视图缩放
 * @returns {{suggestedScale:number, within:boolean}} 建议缩放与是否已在范围内
 */
export function suggestZoomForMeters(meters, policy, currentScale = 1) {
  const { pxPerMeterBase = DEFAULTS.pxPerMeterBase, minSegmentPx = DEFAULTS.minSegmentPx, maxSegmentPx = DEFAULTS.maxSegmentPx } = policy || {};
  const pxAtCurrent = Math.abs(Number(meters) || 0) * pxPerMeterBase * currentScale;
  if (pxAtCurrent >= minSegmentPx && pxAtCurrent <= maxSegmentPx) {
    return { suggestedScale: currentScale, within: true };
  }
  // 目标以范围中值为参考，减少缩放幅度
  const targetPx = Math.sqrt(minSegmentPx * maxSegmentPx);
  const targetScale = (targetPx / (Math.max(1e-6, Math.abs(meters)) * pxPerMeterBase));
  return { suggestedScale: targetScale, within: false };
}

/**
 * 策略整合：根据校准与策略计算某条世界线段的像素长度，并给出约束状态
 * @param {{x:number,y:number}} a 世界起点
 * @param {{x:number,y:number}} b 世界终点
 * @param {{unitsPerMeter?:number}} calibration 校准（世界单位/米）
 * @param {{pxPerMeterBase?:number,minSegmentPx?:number,maxSegmentPx?:number}} policy 比例策略
 * @param {number} viewScale 视图缩放
 * @returns {{px:number,status:'ok'|'short'|'long',clamped:number}}
 */
export function evaluateSegmentPixelLength(a, b, calibration, policy, viewScale = 1) {
  const dxWorld = (b.x - a.x);
  const dyWorld = (b.y - a.y);
  const lenWorld = Math.hypot(dxWorld, dyWorld);
  const upm = Number(calibration?.unitsPerMeter) || DEFAULTS.defaultUnitsPerMeter;
  const pxPerMeterBase = Number(policy?.pxPerMeterBase) || DEFAULTS.pxPerMeterBase;
  // 将世界长度换算为米：lenWorld / upm
  const meters = upm > 0 ? (lenWorld / upm) : lenWorld;
  // 在当前视图缩放下的像素长度（以 base 为 1 倍缩放参考）
  const pxLen = Math.abs(meters) * pxPerMeterBase * viewScale;
  const { status, clamped } = clampPixelLength(pxLen, policy?.minSegmentPx, policy?.maxSegmentPx);
  return { px: pxLen, status, clamped };
}

export default {
  estimateUnitsPerMeter,
  pixelsPerMeter,
  metersToPixels,
  worldToPixels,
  clampPixelLength,
  calcSubdivisionCount,
  splitSegmentWorld,
  suggestZoomForMeters,
  evaluateSegmentPixelLength,
};