import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { animate } from 'animejs';
import pipelineConfig from '../config/pipeline.json' with { type: "json" };
import { parseDiameterNumeric, normalizeMaterialGroup, isPEMaterial, formatDiameterForDisplay } from "../utils/pipelineSpec.js";
import { useProject } from "../contexts/ProjectContext.jsx";


const PLANE_ONLY_COMPONENT_TYPES = new Set(['room', 'door', 'window']);


/**
 * CanvasView 组件
 * - 封装所有 Canvas 绘制与事件处理
 * - 禁止页面缩放与滚动（在画布区域）
 * - 单指触摸仅触发画布拖拽；双指触摸触发缩放
 * - 保持原有绘制功能与选择命中测试
 * - 通过 ref 暴露缩放与重置方法
 */
const CanvasView = forwardRef(function CanvasView(
  {
    id,
    segments: rawSegments,
    components: rawComponents,
    fittings: rawFittings,
    viewMode = 'system',
    planViewModel = null,
    showLabels,
    labelOffsets,
    scale,
    canvasOffset,
    setScale,
    setCanvasOffset,
    designStartPoint,
    selectedSegment,
    selectedComponent,
    selectedFitting,
    selectedEndpoint,
    currentPoint,
    onSelectionChange, // ({ segment, component, fitting })
    onSaveImmediate,   // 保存当前工程（立即）
    onSaveDebounced,   // 保存当前工程（防抖）
    interactionEnabled = true,
    uiMode,
    onMoveComponent,
    onMoveComponentPlan,
    onMoveFitting,
    onMoveFittingPlan,
    onUpdateLabelOffsets,
  },
  ref
) {
  const canvasRef = useRef(null);
const offscreenRef = useRef(null);
const rafIdRef = useRef(0);
const needsRedrawRef = useRef(true);
const drawAllRef = useRef(null);
const isPlaneView = viewMode === 'plane';
const segments = isPlaneView && planViewModel?.planSegments ? planViewModel.planSegments : rawSegments;
const componentsSource = isPlaneView && planViewModel?.planComponents ? planViewModel.planComponents : rawComponents;
const components = (componentsSource || []).filter((component) => {
  if (!component) return false;
  if (!isPlaneView && PLANE_ONLY_COMPONENT_TYPES.has(component.type)) {
    return false;
  }
  return true;
});
const fittings = isPlaneView && planViewModel?.planFittings ? planViewModel.planFittings : rawFittings;

const resolveOriginalSegment = (segment) => {
  if (!isPlaneView || !planViewModel) return segment;
  if (!segment) return segment;
  if (segment.originSegment) return segment.originSegment;
  if (Array.isArray(segment.sourceRefs) && segment.sourceRefs.length) return segment.sourceRefs[0];
  if (Array.isArray(segment.sourceSegments) && segment.sourceSegments.length) {
    const targetId = segment.sourceSegments[0];
    const found = rawSegments.find((s) => s && s.id === targetId);
    if (found) return found;
  }
  if (segment.id != null) {
    const found = rawSegments.find((s) => s && s.id === segment.id);
    if (found) return found;
  }
  return segment;
};

const resolveOriginalComponent = (component) => {
  if (!isPlaneView || !planViewModel) return component;
  if (!component) return component;
  const targetId = component.id;
  const found = rawComponents.find((c) => c && c.id === targetId);
  return found || component;
};

const resolveOriginalFitting = (fitting) => {
  if (!isPlaneView || !planViewModel) return fitting;
  if (!fitting) return fitting;
  const targetId = fitting.id;
  const found = rawFittings.find((f) => f && f.id === targetId);
  return found || fitting;
};

const normalizeHit = (hit) => {
  if (!hit) return hit;
  return {
    ...hit,
    segment: resolveOriginalSegment(hit.segment),
    component: resolveOriginalComponent(hit.component),
    fitting: resolveOriginalFitting(hit.fitting)
  };
};
  const lastTapTimeRef = useRef(0);
  const lastTouchPosRef = useRef({ x: 0, y: 0 });
  const movedDistanceRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPinchDistance, setLastPinchDistance] = useState(null);
  const [breathingPhase, setBreathingPhase] = useState(0);
  const draggingComponentRef = useRef(null);
  const draggingFittingRef = useRef(null);
  const isDraggingFittingRef = useRef(false);
  const isDraggingComponentRef = useRef(false);
  // 房间大小调整拖拽状态
  const isResizingRoomRef = useRef(false);
  const resizingComponentRef = useRef(null);
  const resizeAnchorTLRef = useRef({ x: 0, y: 0 }); // 画布坐标：矩形左上角
  const initialSizeRef = useRef({ w: 0, h: 0 });   // 画布尺寸：当前矩形宽高（像素）
  const planeComponentDragOffsetRef = useRef({ dx: 0, dy: 0 });
  // 文本标注拖拽支持
  const isDraggingLabelRef = useRef(false);
  const draggingLabelKeyRef = useRef(null);
  const labelOffsetsRef = useRef({}); // { [key]: { dx, dy } }
  const labelLayoutsRef = useRef([]); // [{ key, rect: {x1,y1,x2,y2}, side }]
  // 引线可拖拽点（箭头尖、拐点、终点）支持
  const leaderHandlesRef = useRef([]); // [{ key, tip:{x,y}, elbow:{x,y}, anchor:{x,y}, draggable:{ tip:bool, elbow:bool, anchor:bool } }]
  const isDraggingLeaderPointRef = useRef(false);
  const draggingLeaderPointRef = useRef(null); // { key, handle }
  // 与上层持久化的 labelOffsets 同步（仅在上层值变化时）
  useEffect(() => {
    try {
      labelOffsetsRef.current = labelOffsets || {};
      needsRedrawRef.current = true;
    } catch (e) {
      /* ignore */
    }
  }, [labelOffsets]);

  // 从 ProjectContext 获取标注可见性设置与组件更新方法
  const { labelVisibility, setComponents } = useProject();
  // 画布拖拽速度追踪（用于惯性滑动）
  const lastDragTsRef = useRef(0);
  const lastDragPosRef = useRef({ x: 0, y: 0 });
  const dragVelRef = useRef({ vx: 0, vy: 0 });

  // 缩放范围与工具函数（组件内封装）
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 5;
  // 视觉基础比例：将 100% 下的显示放大为原 500% 的效果
// 有效缩放 = scale * BASE_VISUAL_SCALE
const BASE_VISUAL_SCALE = 5;
// 阀门基准尺寸缩放系数：用于整体缩小球阀图形尺寸
const VALVE_SIZE_FACTOR = 1;
// volatile state refs to avoid stale closures in imperative handlers
const scaleRef = useRef(scale);
const offsetRef = useRef(canvasOffset);
const currentPointRef = useRef(currentPoint);
const designStartPointRef = useRef(designStartPoint);
useEffect(() => { scaleRef.current = scale; }, [scale]);
useEffect(() => { offsetRef.current = canvasOffset; }, [canvasOffset]);
useEffect(() => { currentPointRef.current = currentPoint; }, [currentPoint]);
useEffect(() => { designStartPointRef.current = designStartPoint; }, [designStartPoint]);
const exportingRef = useRef(false);
// 导出专用变换：在导出过程中覆盖 scale 与 offset，使绘制基于完整内容范围
const exportTransformRef = useRef({ scale: null, offset: null });
  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  // 动画代理与实例引用
  const scaleAnimRef = useRef(null);
  const panAnimRef = useRef(null);
  const scaleProxyRef = useRef({ s: scale });
  const panProxyRef = useRef({ x: canvasOffset.x, y: canvasOffset.y });
  const pivotRef = useRef({ x: 0, y: 0, s0: scale, o0: { x: canvasOffset.x, y: canvasOffset.y } });

  // 即时缩放（用于捏合手势），以及带动画的缩放（双击/滚轮/按钮）
  const applyZoomAtPivot = (nextScale, pivotX, pivotY) => {
    const clamped = clampScale(nextScale);
    const s0 = scaleRef.current;
    const o0 = offsetRef.current;
    const ratio = clamped / s0;
    const newOffset = {
      x: pivotX - (pivotX - o0.x) * ratio,
      y: pivotY - (pivotY - o0.y) * ratio,
    };
    setScale(clamped);
    setCanvasOffset(newOffset);
  };

  const animateScaleAtPivot = (nextScale, pivotX, pivotY, { duration = 220, ease = 'out(3)' } = {}) => {
    const clamped = clampScale(nextScale);
    const s0 = scaleRef.current;
    const o0 = offsetRef.current;
    pivotRef.current = { x: pivotX, y: pivotY, s0, o0 };
    scaleProxyRef.current.s = s0;
    if (scaleAnimRef.current) {
      if (typeof scaleAnimRef.current.cancel === 'function') {
        scaleAnimRef.current.cancel();
      } else if (typeof scaleAnimRef.current.pause === 'function') {
        scaleAnimRef.current.pause();
      }
      scaleAnimRef.current = null;
    }
    scaleAnimRef.current = animate(scaleProxyRef.current, {
      s: { to: clamped },
      duration,
      ease,
      onUpdate: () => {
        const { x, y, s0, o0 } = pivotRef.current;
        const s = scaleProxyRef.current.s;
        const ratio = s / s0;
        const ox = x - (x - o0.x) * ratio;
        const oy = y - (y - o0.y) * ratio;
        setScale(s);
        setCanvasOffset({ x: ox, y: oy });
      },
      onComplete: () => { onSaveDebounced && onSaveDebounced(); }
    });
  };

  const animatePanTo = (targetX, targetY, { duration = 280, ease = 'out(3)' } = {}) => {
    panProxyRef.current.x = offsetRef.current.x;
    panProxyRef.current.y = offsetRef.current.y;
    if (panAnimRef.current) {
      if (typeof panAnimRef.current.cancel === 'function') {
        panAnimRef.current.cancel();
      } else if (typeof panAnimRef.current.pause === 'function') {
        panAnimRef.current.pause();
      }
      panAnimRef.current = null;
    }
    panAnimRef.current = animate(panProxyRef.current, {
      x: { to: targetX },
      y: { to: targetY },
      duration,
      ease,
      onUpdate: () => {
        setCanvasOffset({ x: panProxyRef.current.x, y: panProxyRef.current.y });
      },
      onComplete: () => { onSaveDebounced && onSaveDebounced(); }
    });
  };

  // 通过 ref 暴露方法
  useImperativeHandle(ref, () => ({
    zoomBy: (factor = 1.1) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const displayWidth = canvas.clientWidth || canvas.offsetWidth || canvas.width;
      const displayHeight = canvas.clientHeight || canvas.offsetHeight || canvas.height;
      const pivotX = displayWidth / 2;
      const pivotY = displayHeight / 2;
      const nextScale = clampScale(scaleRef.current * factor);
      animateScaleAtPivot(nextScale, pivotX, pivotY);
    },
    resetView: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const displayWidth = canvas.clientWidth || canvas.offsetWidth || canvas.width;
      const displayHeight = canvas.clientHeight || canvas.offsetHeight || canvas.height;
      const pivotX = displayWidth / 2;
      const pivotY = displayHeight / 2;
      // 以画布中心为枢点将缩放重置为 100%，并保持内容居中
      animateScaleAtPivot(1, pivotX, pivotY);
    },
    centerCurrentPoint: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const displayWidth = canvas.clientWidth || canvas.offsetWidth || canvas.width;
      const displayHeight = canvas.clientHeight || canvas.offsetHeight || canvas.height;
      const eff = (scaleRef.current || 1) * BASE_VISUAL_SCALE;
      const cp = currentPointRef.current || { x: 200, y: 200 };
      const target = {
        x: displayWidth / 2 - cp.x * eff,
        y: displayHeight / 2 - cp.y * eff,
      };
      animatePanTo(target.x, target.y);
    },
    centerDesignStartPoint: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const displayWidth = canvas.clientWidth || canvas.offsetWidth || canvas.width;
      const displayHeight = canvas.clientHeight || canvas.offsetHeight || canvas.height;
      const eff = (scaleRef.current || 1) * BASE_VISUAL_SCALE;
      const sp = designStartPointRef.current || { x: 200, y: 200 };
      const target = {
        x: displayWidth / 2 - sp.x * eff,
        y: displayHeight / 2 - sp.y * eff,
      };
      animatePanTo(target.x, target.y);
    },
    // 新增：导出图像（包含标注与标题）
    exportImage: async (title = '', scaleMultiplier = 1) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const deviceDpr = globalThis.devicePixelRatio || 1;
      const dpr = deviceDpr * (Number(scaleMultiplier) || 1);

      // —— 第一阶段：计算世界范围与初步绘制（用于收集标签矩形） ——
      const exportScale = scaleRef.current || 1;
      const eff = exportScale * BASE_VISUAL_SCALE;
      const points = [];
      segments.forEach(s => { points.push(s.startPoint, s.endPoint); });
      components.forEach(c => { points.push({ x: c.x, y: c.y }); });
      fittings.forEach(f => { points.push({ x: f.x, y: f.y }); });
      if (points.length === 0) {
        // 空工程，返回一个最小透明图
        const offscreenEmpty = document.createElement('canvas');
        offscreenEmpty.width = Math.floor(320 * dpr);
        offscreenEmpty.height = Math.floor(240 * dpr);
        const ctxEmpty = offscreenEmpty.getContext('2d');
        ctxEmpty.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctxEmpty.clearRect(0, 0, 320, 240);
        return await new Promise((resolve) => {
          offscreenEmpty.toBlob((blob) => resolve(blob), 'image/png');
        });
      }
      const minX = Math.min(...points.map(p => p.x));
      const maxX = Math.max(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y));
      const maxY = Math.max(...points.map(p => p.y));
      const INIT_PAD = 24; // 初步绘制留白
      const contentW = Math.max(1, (maxX - minX) * eff);
      const contentH = Math.max(1, (maxY - minY) * eff);
      const width0 = Math.ceil(contentW + INIT_PAD * 2);
      const height0 = Math.ceil(contentH + INIT_PAD * 2);
      const offset0 = { x: INIT_PAD - minX * eff, y: INIT_PAD - minY * eff };
      const offscreen0 = document.createElement('canvas');
      offscreen0.width = Math.max(1, Math.floor(width0 * dpr));
      offscreen0.height = Math.max(1, Math.floor(height0 * dpr));
      const ctx0 = offscreen0.getContext('2d');
      ctx0.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx0.clearRect(0, 0, width0, height0);

      // 导出模式：使用导出专用变换进行首次绘制，收集标签布局
      exportingRef.current = true;
      exportTransformRef.current = { scale: exportScale, offset: offset0, dpr };
      try {
        if (drawAllRef.current) {
          drawAllRef.current(ctx0, false);
        }
      } finally {
        exportingRef.current = false;
      }

      // —— 计算包含标签的最终范围 ——
      const lineMargin = 4; // 管线边界的额外留白
      const rects = Array.isArray(labelLayoutsRef.current) ? labelLayoutsRef.current.map(l => l.rect) : [];
      const labelsMinX = rects.length ? Math.min(...rects.map(r => r.x1)) : Infinity;
      const labelsMinY = rects.length ? Math.min(...rects.map(r => r.y1)) : Infinity;
      const labelsMaxX = rects.length ? Math.max(...rects.map(r => r.x2)) : -Infinity;
      const labelsMaxY = rects.length ? Math.max(...rects.map(r => r.y2)) : -Infinity;
      const pipesMinX = minX * eff + offset0.x;
      const pipesMinY = minY * eff + offset0.y;
      const pipesMaxX = maxX * eff + offset0.x;
      const pipesMaxY = maxY * eff + offset0.y;
      const unionMinX = Math.min(pipesMinX - lineMargin, labelsMinX);
      const unionMinY = Math.min(pipesMinY - lineMargin, labelsMinY);
      const unionMaxX = Math.max(pipesMaxX + lineMargin, labelsMaxX);
      const unionMaxY = Math.max(pipesMaxY + lineMargin, labelsMaxY);
      const FINAL_PAD = 16; // 基础外边距
      const OUTER_MARGIN = 24; // 主体矩形外额外扩展留白
      const INNER_PAD = FINAL_PAD + OUTER_MARGIN; // 实际使用的外边距
      const unionContentW = (unionMaxX - unionMinX);
      const unionContentH = (unionMaxY - unionMinY);
      const widthF = Math.ceil(unionContentW + INNER_PAD * 2);
      // 标题区高度动态：根据图幅宽度计算字号与留白
      const titleFontPx = Math.round(Math.max(14, Math.min(36, widthF * 0.02))); // 动态字号
      const TITLE_GAP = 48;          // 主体矩形与标题之间的垂直间距（加大）
      const LINE_GAP = 6;            // 标题与粗线之间间距
      const LINE_SPACING = 4;        // 粗细两线之间间距
      const BOTTOM_EXTRA = 10;       // 两条线下方的额外底部留白
      const titleAreaH = TITLE_GAP + titleFontPx + LINE_GAP + LINE_SPACING + BOTTOM_EXTRA;
      const heightF = Math.ceil(unionContentH + INNER_PAD * 2 + titleAreaH);
      // 第二阶段偏移需基于第一阶段偏移进行修正：确保第一阶段的 unionMin 对齐到 FINAL_PAD
      // 目标：cF = c0 + (FINAL_PAD - unionMin)，其中 c0 = p*eff + offset0
      // 因此 offsetF = offset0 + (FINAL_PAD - unionMin)
      const offsetF = {
        x: offset0.x + (INNER_PAD - unionMinX),
        y: offset0.y + (INNER_PAD - unionMinY)
      };

      // —— 第二阶段：按最终尺寸重新绘制并添加标题 ——
      const offscreenF = document.createElement('canvas');
      offscreenF.width = Math.max(1, Math.floor(widthF * dpr));
      offscreenF.height = Math.max(1, Math.floor(heightF * dpr));
      const ctxF = offscreenF.getContext('2d');
      ctxF.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxF.clearRect(0, 0, widthF, heightF);

      exportingRef.current = true;
      exportTransformRef.current = { scale: exportScale, offset: offsetF, dpr };
      try {
        if (drawAllRef.current) {
          drawAllRef.current(ctxF, false);
        }
      } finally {
        exportingRef.current = false;
      }

      if (title && typeof title === 'string') {
        ctxF.save();
        ctxF.font = `bold ${titleFontPx}px system-ui, -apple-system, Segoe UI, Roboto`;
        ctxF.textBaseline = 'top';
        ctxF.textAlign = 'center';
        const cx = widthF / 2;
        const contentBottom = INNER_PAD + unionContentH;
        const titleY = contentBottom + TITLE_GAP;
        ctxF.fillStyle = '#000000';
        ctxF.fillText(title, cx, titleY);
        // 计算标题等长的两条水平线
        const tw = ctxF.measureText(title).width;
        const lineX1 = cx - tw / 2;
        const lineX2 = cx + tw / 2;
        // 粗线（较粗）
        const thickY = titleY + titleFontPx + LINE_GAP;
        ctxF.beginPath();
        ctxF.moveTo(lineX1, thickY);
        ctxF.lineTo(lineX2, thickY);
        ctxF.lineWidth = 2;
        ctxF.strokeStyle = '#000000';
        ctxF.stroke();
        // 细线（较细）
        const thinY = thickY + LINE_SPACING;
        ctxF.beginPath();
        ctxF.moveTo(lineX1, thinY);
        ctxF.lineTo(lineX2, thinY);
        ctxF.lineWidth = 1;
        ctxF.strokeStyle = '#000000';
        ctxF.stroke();
        ctxF.restore();
      }

      return await new Promise((resolve) => {
        offscreenF.toBlob((blob) => {
          resolve(blob);
        }, 'image/png');
      });
    }

  }));

  // 命中测试辅助：点到线段距离
  const distancePointToSegment = (px, py, x1, y1, x2, y2) => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    const dx = px - xx;
    const dy = py - yy;
    return Math.hypot(dx, dy);
  };

  // 计算锚点（画布坐标）处最近管段的方向角（世界坐标角度）
  const getNearestPipeAngle = (anchor) => {
    try {
      const renderScale = (exportingRef.current && exportTransformRef.current.scale != null)
        ? exportTransformRef.current.scale
        : scale;
      const eff = renderScale * BASE_VISUAL_SCALE;
      const renderOffset = (exportingRef.current && exportTransformRef.current.offset)
        ? exportTransformRef.current.offset
        : canvasOffset;
      const wx = (anchor?.x - renderOffset.x) / eff;
      const wy = (anchor?.y - renderOffset.y) / eff;
      let minD = Infinity;
      let ang = 0;
      for (const s of segments) {
        const d = distancePointToSegment(wx, wy, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
        if (d < minD) {
          minD = d;
          ang = Math.atan2(s.endPoint.y - s.startPoint.y, s.endPoint.x - s.startPoint.x);
        }
      }
      return ang;
    } catch {
      return 0;
    }
  };

  // 计算最近管段及其投影点（世界坐标），供拖拽吸附
  const computeNearestSegmentPoint = (wx, wy) => {
    let bestSeg = null;
    let bestDist = Infinity;
    let segPoint = null;
    let t = 0;
    segments.forEach(s => {
      const d = distancePointToSegment(wx, wy, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
      if (d < bestDist) {
        bestDist = d;
        bestSeg = s;
        const x1 = s.startPoint.x, y1 = s.startPoint.y;
        const x2 = s.endPoint.x, y2 = s.endPoint.y;
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        const t0 = lenSq !== 0 ? ((wx - x1) * dx + (wy - y1) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t0));
        segPoint = { x: x1 + t * dx, y: y1 + t * dy };
      }
    });
    return { segment: bestSeg, segmentPoint: segPoint, t };
  };

  const hitTestAtCanvasPoint = (cx, cy) => {
    const eff = scale * BASE_VISUAL_SCALE;
    const wx = (cx - canvasOffset.x) / eff;
    const wy = (cy - canvasOffset.y) / eff;
    const segThresh = 12 / eff;
    const nodeThresh = 20 / eff; // 合理端点点击范围，优先端点

    // 删除模式：优先命中设备/配件；不命中则考虑管段；忽略端点
    if (uiMode === 'delete') {
      // 使用画布坐标的把手矩形进行命中，以支持大型平面（如房间）在任意位置点击删除
      let bestKind = null; // 'component' | 'fitting'
      let bestItem = null;
      let bestDist = Infinity;
      for (const c of components) {
        if (!c) continue;
        const r = getComponentHandleRect(c);
        if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
          const centerX = (r.x1 + r.x2) / 2;
          const centerY = (r.y1 + r.y2) / 2;
          const d = Math.hypot(cx - centerX, cy - centerY);
          if (d < bestDist) { bestDist = d; bestItem = c; bestKind = 'component'; }
        }
      }
      for (const f of fittings) {
        if (!f) continue;
        const r = getFittingHandleRect(f);
        if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
          const centerX = (r.x1 + r.x2) / 2;
          const centerY = (r.y1 + r.y2) / 2;
          const d = Math.hypot(cx - centerX, cy - centerY);
          if (d < bestDist) { bestDist = d; bestItem = f; bestKind = 'fitting'; }
        }
      }
      if (bestItem && bestKind === 'component') {
        return { segment: null, component: bestItem, fitting: null, endpoint: null, segmentPoint: null, t: null };
      }
      if (bestItem && bestKind === 'fitting') {
        return { segment: null, component: null, fitting: bestItem, endpoint: null, segmentPoint: null, t: null };
      }
      let bestSeg = null; let bestSegDist = Infinity;
      segments.forEach(s => {
        const dl = distancePointToSegment(wx, wy, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
        if (dl < segThresh && dl < bestSegDist) { bestSegDist = dl; bestSeg = s; }
      });
      if (bestSegDist === Infinity || !bestSeg) return null;
      let segPoint = null; let t = null;
      {
        const x1 = bestSeg.startPoint.x, y1 = bestSeg.startPoint.y;
        const x2 = bestSeg.endPoint.x, y2 = bestSeg.endPoint.y;
        const C = x2 - x1, D = y2 - y1;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = ((wx - x1) * C + (wy - y1) * D) / lenSq;
        if (param < 0) param = 0; else if (param > 1) param = 1; // clamp
        segPoint = { x: x1 + param * C, y: y1 + param * D };
        t = param;
      }
      return { segment: bestSeg, component: null, fitting: null, endpoint: null, segmentPoint: segPoint, t };
    }

    // 移动模式：先检测可拖拽的引线把手（优先于文本/组件/配件），避免端点抢占
    if (uiMode === 'move') {
      try {
        const handles = leaderHandlesRef.current || [];
        // reduce hit radius to match smaller visual dots
        const hitR = Math.max(5, 4 * (scale || 1));
        for (const h of handles) {
          if (!h) continue;
          if (h.tip && h.draggable && h.draggable.tip) {
            const d = Math.hypot(cx - h.tip.x, cy - h.tip.y);
            if (d <= hitR) return { leaderHandle: { key: h.key, handle: 'tip' } };
          }
          if (h.end && h.draggable && h.draggable.end) {
            const d2 = Math.hypot(cx - h.end.x, cy - h.end.y);
            if (d2 <= hitR) return { leaderHandle: { key: h.key, handle: 'end' } };
          }
          if (h.elbow && h.draggable && h.draggable.elbow) {
            const d = Math.hypot(cx - h.elbow.x, cy - h.elbow.y);
            if (d <= hitR) return { leaderHandle: { key: h.key, handle: 'elbow' } };
          }
          if (h.anchor && h.draggable && h.draggable.anchor) {
            const d = Math.hypot(cx - h.anchor.x, cy - h.anchor.y);
            if (d <= hitR) return { leaderHandle: { key: h.key, handle: 'anchor' } };
          }
        }
      } catch (e) { /* ignore */ }
      // 房间右下角控制点命中（优先于标签/组件/配件）
      try {
        const handleR = Math.max(6, 4 * (scale || 1));
        for (const c of components) {
          if (!c || c.type !== 'room') continue;
          const r = getComponentHandleRect(c);
          const d = Math.hypot(cx - r.x2, cy - r.y2);
          if (d <= handleR) {
            return { componentResize: { id: c.id, corner: 'br', component: c }, segment: null, component: null, fitting: null, endpoint: null };
          }
        }
      } catch (e) { /* ignore */ }
      if (labelLayoutsRef.current && labelLayoutsRef.current.length) {
        for (const lay of labelLayoutsRef.current) {
          const r = lay.rect;
          if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
            return { label: { key: lay.key, rect: r, side: lay.side }, segment: null, component: null, fitting: null, endpoint: null };
          }
        }
      }
      // 优先命中窗，避免被房间/管段抢占
      for (const c of components) {
        if (!c || c.type !== 'window') continue;
        const r = getComponentHandleRect(c);
        if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
          return { segment: null, component: c, fitting: null, endpoint: null, segmentPoint: null, t: null };
        }
      }
      // 其次命中其它组件（含房间、门等）
      for (const c of components) {
        if (!c || c.type === 'window') continue;
        const r = getComponentHandleRect(c);
        if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
          return { segment: null, component: c, fitting: null, endpoint: null, segmentPoint: null, t: null };
        }
      }
      for (const f of fittings) {
        const r = getFittingHandleRect(f);
        if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
          return { segment: null, component: null, fitting: f, endpoint: null, segmentPoint: null, t: null };
        }
      }
      // 若未命中标签或把手，继续后续端点/管段检测
    }

    // 1) 组件/配件优先：使用把手矩形检测，优先于端点
    let bestComp = null; let bestCompDist = Infinity;
    for (const c of components) {
      if (!c) continue;
      const r = getComponentHandleRect(c);
      if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
        const centerX = (r.x1 + r.x2) / 2;
        const centerY = (r.y1 + r.y2) / 2;
        const d = Math.hypot(cx - centerX, cy - centerY);
        if (d < bestCompDist) { bestCompDist = d; bestComp = c; }
      }
    }
    let bestFitting = null; let bestFittingDist = Infinity;
    for (const f of fittings) {
      if (!f) continue;
      const r = getFittingHandleRect(f);
      if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
        const centerX = (r.x1 + r.x2) / 2;
        const centerY = (r.y1 + r.y2) / 2;
        const d = Math.hypot(cx - centerX, cy - centerY);
        if (d < bestFittingDist) { bestFittingDist = d; bestFitting = f; }
      }
    }

    // 若命中设备或配件，优先返回它们
    if (bestCompDist < Infinity || bestFittingDist < Infinity) {
      if (bestCompDist <= bestFittingDist) {
        return { segment: null, component: bestComp, fitting: null, endpoint: null, segmentPoint: null, t: null };
      } else {
        return { segment: null, component: null, fitting: bestFitting, endpoint: null, segmentPoint: null, t: null };
      }
    }

    // 2) 端点检测：仅在未命中组件/配件时考虑
    let bestEndpoint = null;
    let bestEndpointDist = Infinity;
    segments.forEach(s => {
      const ds = Math.hypot(wx - s.startPoint.x, wy - s.startPoint.y);
      if (ds < nodeThresh && ds < bestEndpointDist) {
        bestEndpointDist = ds;
        bestEndpoint = { x: s.startPoint.x, y: s.startPoint.y };
      }
      const de = Math.hypot(wx - s.endPoint.x, wy - s.endPoint.y);
      if (de < nodeThresh && de < bestEndpointDist) {
        bestEndpointDist = de;
        bestEndpoint = { x: s.endPoint.x, y: s.endPoint.y };
      }
    });
    // 调压箱底部连接点与燃气表顶部连接点也作为可选端点
    components.forEach(c => {
      if (c && (c.type === 'regulator' || c.type === 'meter')) {
        const verts = getComponentSnapVerticesWorld(c) || [];
        for (const v of verts) {
          const dv = Math.hypot(wx - v.x, wy - v.y);
          if (dv < nodeThresh && dv < bestEndpointDist) {
            bestEndpointDist = dv;
            bestEndpoint = { x: v.x, y: v.y };
          }
        }
      }
    });
    if (bestEndpoint) {
      return { segment: null, component: null, fitting: null, endpoint: bestEndpoint };
    }

    // 4) 管段体（仅在未命中设备/配件时考虑）
    let bestSeg = null; let bestSegDist = Infinity;
    segments.forEach(s => {
      const dl = distancePointToSegment(wx, wy, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
      if (dl < segThresh && dl < bestSegDist) { bestSegDist = dl; bestSeg = s; }
    });

    if (bestSegDist === Infinity) return null;
    // 为管段命中返回最近点与参数 t（世界坐标）
    let segPoint = null;
    let t = null;
    {
      const x1 = bestSeg.startPoint.x, y1 = bestSeg.startPoint.y;
      const x2 = bestSeg.endPoint.x, y2 = bestSeg.endPoint.y;
      const C = x2 - x1, D = y2 - y1;
      const lenSq = C * C + D * D;
      let param = -1;
      if (lenSq !== 0) param = ((wx - x1) * C + (wy - y1) * D) / lenSq;
      if (param < 0) param = 0; else if (param > 1) param = 1; // clamp
      segPoint = { x: x1 + param * C, y: y1 + param * D };
      t = param;
    }
    return { segment: bestSeg, component: null, fitting: null, endpoint: null, segmentPoint: segPoint, t };
  };

  // 绘制逻辑（颜色来自配置）
  const diameterColorMap = pipelineConfig.diameterColors;



  // 端点不再绘制蓝色圆点；仅在选中时单独绘制红色呼吸光点

  const drawSegment = (ctx, segment, isSelected) => {
    const { startPoint, endPoint, material, diameter } = segment;
    const renderScale = (exportingRef.current && exportTransformRef.current.scale != null)
      ? exportTransformRef.current.scale
      : scale;
    const eff = renderScale * BASE_VISUAL_SCALE;
    const renderOffset = (exportingRef.current && exportTransformRef.current.offset)
      ? exportTransformRef.current.offset
      : canvasOffset;
    const startX = startPoint.x * eff + renderOffset.x;
    const startY = startPoint.y * eff + renderOffset.y;
    const endX = endPoint.x * eff + renderOffset.x;
    const endY = endPoint.y * eff + renderOffset.y;

    const color = exportingRef.current
      ? '#000000'
      : (isSelected ? '#ff0000' : (diameterColorMap[diameter] || '#000000'));
    const useDash = isPEMaterial(material);

    // 防止虚线状态泄漏到后续设备/标注：保存/恢复上下文
    ctx.save();
    ctx.lineWidth = isSelected ? 4 : 2; // 不区分线宽
    ctx.strokeStyle = color;
    if (ctx.setLineDash) {
      if (useDash) ctx.setLineDash([8, 6]); else ctx.setLineDash([]);
    }

    // 交叉断开：后绘制的线段在与先绘制段交点前后留出空隙
    const idx = segments.indexOf(segment);
    const worldLen = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
    const EPS = 1e-6;
    const GAP_BEFORE_PX = 6; // 交叉前留白像素
    const GAP_AFTER_PX = 6;  // 交叉后留白像素
    const gapBeforeWorld = GAP_BEFORE_PX / eff;
    const gapAfterWorld = GAP_AFTER_PX / eff;

    // 线段相交参数计算（返回当前段的参数 t）
    const intersectParamT = (a1, a2, b1, b2) => {
      const r = { x: a2.x - a1.x, y: a2.y - a1.y };
      const s = { x: b2.x - b1.x, y: b2.y - b1.y };
      const rxs = r.x * s.y - r.y * s.x;
      const qp = { x: b1.x - a1.x, y: b1.y - a1.y };
      const qpxr = qp.x * r.y - qp.y * r.x;
      if (Math.abs(rxs) < EPS) {
        // 平行或共线：不视为“穿过”
        return null;
      }
      const t = (qp.x * s.y - qp.y * s.x) / rxs;
      const u = qpxr / rxs;
      if (t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS) {
        return t; // 严格在两段内部的交点
      }
      return null;
    };

    let gaps = [];
    if (worldLen > EPS && idx > 0) {
      const earlier = segments.slice(0, idx);
      for (const s2 of earlier) {
        const t = intersectParamT(startPoint, endPoint, s2.startPoint, s2.endPoint);
        if (t == null) continue;
        const a = Math.max(0, t - gapBeforeWorld / worldLen);
        const b = Math.min(1, t + gapAfterWorld / worldLen);
        gaps.push({ a, b });
      }
    }

    // 合并重叠的留白区间
    if (gaps.length > 1) {
      gaps.sort((p, q) => p.a - q.a);
      const merged = [gaps[0]];
      for (let i = 1; i < gaps.length; i++) {
        const last = merged[merged.length - 1];
        const cur = gaps[i];
        if (cur.a <= last.b + EPS) {
          last.b = Math.max(last.b, cur.b);
        } else {
          merged.push(cur);
        }
      }
      gaps = merged;
    }

    // 计算允许绘制的区间（排除留白）并绘制
    const allowed = [];
    if (!gaps.length || worldLen <= EPS) {
      allowed.push({ s: 0, e: 1 });
    } else {
      let lastE = 0;
      for (const g of gaps) {
        if (g.a > lastE + EPS) allowed.push({ s: lastE, e: g.a });
        lastE = Math.max(lastE, g.b);
      }
      if (lastE < 1 - EPS) allowed.push({ s: lastE, e: 1 });
    }

    ctx.beginPath();
    for (const iv of allowed) {
      const sx = startX + (endX - startX) * iv.s;
      const sy = startY + (endY - startY) * iv.s;
      const ex = startX + (endX - startX) * iv.e;
      const ey = startY + (endY - startY) * iv.e;
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
    }
    ctx.stroke();
    ctx.restore();

    // 取消默认端点圆点绘制；端点选中状态由红色呼吸光点统一处理
  };

  // 计算组件的把手矩形（画布坐标，轴对齐）
  const getComponentHandleRect = (component) => {
    const eff = scale * BASE_VISUAL_SCALE;
    let posX = component.x * eff + canvasOffset.x;
    let posY = component.y * eff + canvasOffset.y;
    let w = 24 * VALVE_SIZE_FACTOR * scale;
    let h = 16 * VALVE_SIZE_FACTOR * scale;
    switch (component.type) {
      case 'door': {
        // 按 room + wallPos 参数化计算门中心
        try {
          const room = components.find(r => r && r.type === 'room' && String(r.id) === String(component.roomId));
          if (room) {
            const wRoom = room.w ?? 80; const hRoom = room.h ?? 60;
            const cx = room.x, cy = room.y; const hx = wRoom / 2, hy = hRoom / 2;
            const outerLeftX = cx - hx;
            const outerRightX = cx + hx;
            const outerBottomY = cy - hy;
            const outerTopY = cy + hy;
            const t = Math.max(0, Math.min(1, Number(component.wallPos ?? 0.5)));
            if (component.wallSide === 'top') {
              const L = Math.max(1e-6, outerRightX - outerLeftX);
              const nx = outerLeftX + L * t; const ny = outerTopY;
              posX = nx * eff + canvasOffset.x; posY = ny * eff + canvasOffset.y;
            } else if (component.wallSide === 'bottom') {
              const L = Math.max(1e-6, outerRightX - outerLeftX);
              const nx = outerLeftX + L * t; const ny = outerBottomY;
              posX = nx * eff + canvasOffset.x; posY = ny * eff + canvasOffset.y;
            } else if (component.wallSide === 'left') {
              const L = Math.max(1e-6, outerTopY - outerBottomY);
              const ny = outerBottomY + L * t; const nx = outerLeftX;
              posX = nx * eff + canvasOffset.x; posY = ny * eff + canvasOffset.y;
            } else if (component.wallSide === 'right') {
              const L = Math.max(1e-6, outerTopY - outerBottomY);
              const ny = outerBottomY + L * t; const nx = outerRightX;
              posX = nx * eff + canvasOffset.x; posY = ny * eff + canvasOffset.y;
            }
            // 把手尺寸按墙厚
            const wallPx = Math.max(2, (room.wall ?? 6) * eff);
            w = wallPx * 2; h = wallPx * 2;
          }
        } catch {}
        break;
      }
      case 'window': {
        // 按 room + wallPos 参数化计算窗口中心
        try {
          const room = components.find(r => r && r.type === 'room' && String(r.id) === String(component.roomId));
          if (room) {
            const wRoom = room.w ?? 80; const hRoom = room.h ?? 60; const wall = Math.max(1, room.wall ?? 6);
            const cx = room.x, cy = room.y; const hx = wRoom / 2, hy = hRoom / 2;
            const innerLeftX = cx - hx + wall / 2;
            const innerRightX = cx + hx - wall / 2;
            const innerBottomY = cy - hy + wall / 2;
            const innerTopY = cy + hy - wall / 2;
            const t = Math.max(0, Math.min(1, Number(component.wallPos ?? 0.5)));
            if (component.wallSide === 'top') {
              const L = Math.max(1e-6, innerRightX - innerLeftX);
              const nx = innerLeftX + L * t; const ny = innerTopY;
              posX = nx * eff + canvasOffset.x; posY = ny * eff + canvasOffset.y;
            } else if (component.wallSide === 'bottom') {
              const L = Math.max(1e-6, innerRightX - innerLeftX);
              const nx = innerLeftX + L * t; const ny = innerBottomY;
              posX = nx * eff + canvasOffset.x; posY = ny * eff + canvasOffset.y;
            } else if (component.wallSide === 'left') {
              const L = Math.max(1e-6, innerTopY - innerBottomY);
              const ny = innerBottomY + L * t; const nx = innerLeftX;
              posX = nx * eff + canvasOffset.x; posY = ny * eff + canvasOffset.y;
            } else if (component.wallSide === 'right') {
              const L = Math.max(1e-6, innerTopY - innerBottomY);
              const ny = innerBottomY + L * t; const nx = innerRightX;
              posX = nx * eff + canvasOffset.x; posY = ny * eff + canvasOffset.y;
            }
          }
        } catch {}
        // 窗：细长矩形占位。高度按墙厚限制，方向由 wallSide 决定
        const wBase = 32 * scale;
        const hBase = 10 * scale;
        // 使用 eff 计算墙厚，确保与绘制一致
        let wallPx = Math.max(2, 6 * (scale * BASE_VISUAL_SCALE));
        try {
          const room = components.find(r => r && r.type === 'room' && String(r.id) === String(component.roomId));
          if (room && room.wall != null) wallPx = Math.max(2, room.wall * (scale * BASE_VISUAL_SCALE));
        } catch { /* ignore */ }
        // 厚度与墙厚保持一致（减去少量描边余量）
        const thick = Math.max(2, wallPx - 2);
        const vertical = component && (component.wallSide === 'left' || component.wallSide === 'right');
        w = vertical ? thick : wBase;
        h = vertical ? wBase : thick;
        break;
      }
      case 'flangeValve': {
        const halfLen = 12 * VALVE_SIZE_FACTOR * scale;
        const flangeGap = 3 * VALVE_SIZE_FACTOR * scale;
        const flangeHeight = 12 * VALVE_SIZE_FACTOR * scale; // 近似高度
        w = halfLen * 2 + flangeGap * 2;
        h = Math.max(flangeHeight, 12 * VALVE_SIZE_FACTOR * scale);
        break;
      }
      case 'copperValve':
      case 'explosionProofValve': {
        const halfLen = 12 * VALVE_SIZE_FACTOR * scale;
        const halfHeight = 6 * VALVE_SIZE_FACTOR * scale;
        w = halfLen * 2;
        h = halfHeight * 2 + 8 * VALVE_SIZE_FACTOR * scale; // 略放大便于操作
        break;
      }
      case 'pillar': {
        // 工字形占位：以顶部交点为锚点，竖线向下延伸
        const totalH = 30 * scale; // 整体高度基准（与旧矩形近似）
        const vLen = totalH * 0.8; // 竖线更长
        const hLenEach = vLen * 0.4; // 水平线更短
        const fullW = hLenEach * 2;
        w = Math.max(10 * scale, fullW);
        h = Math.max(30 * scale, vLen);
        break;
      }
      case 'heatShrinkSleeve': {
        // 热收缩套：长条矩形，占位更细长
        w = 36 * VALVE_SIZE_FACTOR * scale;
        h = 10 * VALVE_SIZE_FACTOR * scale;
        break;
      }
      case 'meter': {
        // 燃气表：矩形，与绘制尺寸一致
        w = 30 * scale; h = 20 * scale; break;
      }
      case 'regulator': {
        // 调压箱：矩形，与绘制尺寸一致
        w = 34 * scale; h = 22 * scale; break;
      }
      case 'junction': {
        // 接驳点：小圆点，交互把手略放大
        w = 20 * scale; h = 20 * scale; break;
      }
      case 'blockage': {
        w = 20 * scale; h = 20 * scale; break;
      }
      default: {
        w = 12 * scale; h = 12 * scale; break;
      }
    }
    w += 6 * scale; h += 6 * scale;
    return { x1: posX - w / 2, y1: posY - h / 2, x2: posX + w / 2, y2: posY + h / 2 };
  };

  // 计算配件的把手矩形（画布坐标，轴对齐）
  const getFittingHandleRect = (fitting) => {
    const eff = scale * BASE_VISUAL_SCALE;
    const posX = fitting.x * eff + canvasOffset.x;
    const posY = fitting.y * eff + canvasOffset.y;
    let w = 12 * scale; let h = 12 * scale;
    switch (fitting.type) {
      case 'elbow': { w = 12 * scale; h = 12 * scale; break; }
      case 'tee': { w = 18 * scale; h = 18 * scale; break; }
      case 'reducer': { w = 14 * scale; h = 14 * scale; break; }
      default: { w = 10 * scale; h = 10 * scale; break; }
    }
    w += 6 * scale; h += 6 * scale;
    return { x1: posX - w / 2, y1: posY - h / 2, x2: posX + w / 2, y2: posY + h / 2 };
  };

  // 计算最近管段的方向角（世界坐标），用于组件朝向估计
  const getNearestSegmentAngleWorld = (wx, wy) => {
    let minD = Infinity;
    let ang = 0;
    for (const s of segments) {
      if (!s) continue;
      const x1 = s.startPoint.x, y1 = s.startPoint.y;
      const x2 = s.endPoint.x, y2 = s.endPoint.y;
      const C = x2 - x1, D = y2 - y1;
      const lenSq = C * C + D * D || 1;
      let t = ((wx - x1) * C + (wy - y1) * D) / lenSq;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = x1 + t * C, py = y1 + t * D;
      const d = Math.hypot(px - wx, py - wy);
      if (d < minD) {
        minD = d;
        ang = Math.atan2(y2 - y1, x2 - x1);
      }
    }
    return ang;
  };

  // 估计组件朝向角（世界坐标角度）
  const getAngleForComponentGeneral = (comp) => {
    const segId = comp && (isPlaneView ? (comp.renderSegmentId || comp.segmentId) : comp.segmentId);
    if (segId) {
      const candidateSegments = isPlaneView && planViewModel?.planSegments ? planViewModel.planSegments : rawSegments;
      const s = candidateSegments.find(ss => ss && ss.id === segId);
      if (s) {
        return Math.atan2(s.endPoint.y - s.startPoint.y, s.endPoint.x - s.startPoint.x);
      }
    }
    return getNearestSegmentAngleWorld(comp.x, comp.y);
  };

  // 计算组件的“可吸附顶点”（世界坐标）。目前支持阀门类：铜球阀、法兰球阀、防爆电磁球阀。
  const getComponentSnapVerticesWorld = (comp) => {
    if (!comp || !comp.type) return [];
    const ang = getAngleForComponentGeneral(comp);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const rot = (dx, dy) => ({
      x: comp.x + dx * cos - dy * sin,
      y: comp.y + dx * sin + dy * cos,
    });
    const pxToWorld = (px) => px / (scale * BASE_VISUAL_SCALE);
    const halfLen = pxToWorld(12 * VALVE_SIZE_FACTOR * scale);
    const halfHeight = pxToWorld(6 * VALVE_SIZE_FACTOR * scale);
    if (comp.type === 'copperValve' || comp.type === 'explosionProofValve') {
      // 两个三角的四个角点
      return [
        rot(-halfLen, -halfHeight),
        rot(-halfLen, halfHeight),
        rot(halfLen, -halfHeight),
        rot(halfLen, halfHeight),
      ];
    }
    if (comp.type === 'flangeValve') {
      const flangeGap = pxToWorld(3 * VALVE_SIZE_FACTOR * scale);
      const flangeHeight = (halfHeight * 2) + pxToWorld(6 * VALVE_SIZE_FACTOR * scale);
      // 三角角点 + 法兰面上下端点
      return [
        rot(-halfLen, -halfHeight),
        rot(-halfLen, halfHeight),
        rot(halfLen, -halfHeight),
        rot(halfLen, halfHeight),
        rot(-halfLen - flangeGap, -flangeHeight / 2),
        rot(-halfLen - flangeGap, flangeHeight / 2),
        rot(halfLen + flangeGap, -flangeHeight / 2),
        rot(halfLen + flangeGap, flangeHeight / 2),
      ];
    }
    // 燃气表：矩形顶部两个连接点（世界坐标）
    if (comp.type === 'meter') {
      const halfW = pxToWorld(15 * scale);
      const halfH = pxToWorld(10 * scale);
      const inset = pxToWorld(4 * scale);
      const left = { x: comp.x + (-halfW + inset), y: comp.y - halfH };
      const right = { x: comp.x + (halfW - inset), y: comp.y - halfH };
      return [left, right];
    }
    // 调压箱：矩形底部两个连接点（世界坐标）
    if (comp.type === 'regulator') {
      // 与绘制保持一致（固定方向，不随管线旋转）
      const halfW = pxToWorld(17 * scale);
      const halfH = pxToWorld(11 * scale);
      const inset = pxToWorld(4 * scale);
      const left = { x: comp.x + (-halfW + inset), y: comp.y + halfH };
      const right = { x: comp.x + (halfW - inset), y: comp.y + halfH };
      return [left, right];
    }
    return [];
  };

  // 绘制移动模式下的虚线把手覆盖层（标签/组件/配件）
  const drawMoveHandles = (ctx) => {
    if (uiMode !== 'move') return;
    ctx.save();
    if (ctx.setLineDash) ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    // 使用紫色虚线框以符合视觉规范
    ctx.strokeStyle = '#7c3aed';
    const strokeRect = (r) => {
      const w = r.x2 - r.x1;
      const h = r.y2 - r.y1;
      ctx.strokeRect(r.x1, r.y1, w, h);
    };
    // 仅在显示标签时绘制标签虚线框；隐藏时也清空缓存，避免新建工程后残留
    if (showLabels && labelLayoutsRef.current && labelLayoutsRef.current.length) {
      for (const lay of labelLayoutsRef.current) {
        // 只绘制实际有文本且可见的标签框，避免出现空白的虚线框
        if (lay && lay.isVisible && lay.text && String(lay.text).trim().length > 0) {
          strokeRect(lay.rect);
        }
      }
    } else if (!showLabels && labelLayoutsRef.current && labelLayoutsRef.current.length) {
      labelLayoutsRef.current = [];
    }
    for (const c of components) {
      const r = getComponentHandleRect(c);
      strokeRect(r);
      // 房间右下角控制点（紫色圆点，仅移动模式、非导出时显示）
      if (c && c.type === 'room' && !exportingRef.current) {
        const handleR = Math.max(5, 4 * (scale || 1));
        ctx.save();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(r.x2, r.y2, handleR, 0, Math.PI * 2);
        ctx.fillStyle = '#7c3aed';
        ctx.fill();
        ctx.restore();
      }
    }
    for (const f of fittings) {
      const r = getFittingHandleRect(f);
      strokeRect(r);
    }
    // Previously we drew purple circular handles for draggable leader points here.
    // Those visual dots were removed per UX request; hit-testing still relies on
    // leaderHandlesRef.current and the arrow tip is rendered purple in
    // drawSegmentsOrth when draggable.
    ctx.restore();
  };

  const drawComponent = (ctx, component, isSelected) => {
    const { x, y, type } = component;
    // 强力保险：导出时不绘制接驳点（即使后续分支修改漏掉）
    if (exportingRef.current && type === 'junction') {
      return;
    }
    const renderScale = (exportingRef.current && exportTransformRef.current.scale != null)
      ? exportTransformRef.current.scale
      : scale;
    const eff = renderScale * BASE_VISUAL_SCALE;
    const renderOffset = (exportingRef.current && exportTransformRef.current.offset)
      ? exportTransformRef.current.offset
      : canvasOffset;
    const posX = x * eff + renderOffset.x;
    const posY = y * eff + renderOffset.y;
    // 设备绘制前重置线型，避免继承管段虚线
    if (ctx.setLineDash) ctx.setLineDash([]);
    ctx.beginPath();
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeStyle = isSelected ? '#ff0000' : '#000000';
    ctx.fillStyle = '#ffffff';
    // 计算与最近管段的方向角，用于使符号沿管段方向旋转
    const distancePointToSegmentWorld = (px, py, x1, y1, x2, y2) => {
      const A = px - x1;
      const B = py - y1;
      const C = x2 - x1;
      const D = y2 - y1;
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      if (lenSq !== 0) param = dot / lenSq;
      let xx, yy;
      if (param < 0) { xx = x1; yy = y1; }
      else if (param > 1) { xx = x2; yy = y2; }
      else { xx = x1 + param * C; yy = y1 + param * D; }
      const dx = px - xx;
      const dy = py - yy;
      return Math.hypot(dx, dy);
    };
    const getNearestSegmentAngle = (wx, wy) => {
      let minD = Infinity;
      let ang = 0;
      for (const s of segments) {
        const d = distancePointToSegmentWorld(wx, wy, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
        if (d < minD) {
          minD = d;
          ang = Math.atan2(s.endPoint.y - s.startPoint.y, s.endPoint.x - s.startPoint.x);
        }
      }
      return ang;
    };
    const getAngleForComponent = (comp) => {
      const segId = comp && comp.segmentId;
      if (segId) {
        const s = segments.find(ss => ss.id === segId);
        if (s) {
          return Math.atan2(s.endPoint.y - s.startPoint.y, s.endPoint.x - s.startPoint.x);
        }
      }
      return getNearestSegmentAngle(comp.x, comp.y);
    };
      switch (type) {
        case 'room': {
          // 房间：轴对齐矩形（描边，不填充）。尺寸与墙厚均按 eff（scale*BASE_VISUAL_SCALE）缩放，确保与参数化坐标一致
          const rw = (component.w ?? 80) * eff;
          const rh = (component.h ?? 60) * eff;
          // 墙体厚度：两个矩形之间的间隙（使用 eff 保持与窗口厚度一致）
          const wallPx = Math.max(2, (component.wall ?? 6) * eff);
          const iw = Math.max(4, rw - wallPx * 2);
          const ih = Math.max(4, rh - wallPx * 2);
          ctx.save();
          ctx.translate(posX, posY);
          // 仅描边：外矩形与内矩形（背景保持透明）
          ctx.beginPath();
          ctx.rect(-rw / 2, -rh / 2, rw, rh);
          ctx.stroke();
          ctx.beginPath();
          ctx.rect(-iw / 2, -ih / 2, iw, ih);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'door': {
          // 门：四分之一圆弧样式，圆心在房间最外矩形边上，半径为墙厚，扇形朝室内
          let drawX = posX, drawY = posY;
          let rArc = Math.max(2, 6 * eff);
          try {
            const room = components.find(r => r && r.type === 'room' && String(r.id) === String(component.roomId));
            if (room) {
              const wRoom = room.w ?? 80; const hRoom = room.h ?? 60;
              const cx = room.x, cy = room.y; const hx = wRoom / 2, hy = hRoom / 2;
              const outerLeftX = cx - hx;
              const outerRightX = cx + hx;
              const outerBottomY = cy - hy;
              const outerTopY = cy + hy;
              rArc = Math.max(2, (room.wall ?? 6) * eff);
              const t = Math.max(0, Math.min(1, Number(component.wallPos ?? 0.5)));
              if (component.wallSide === 'top') {
                const L = Math.max(1e-6, outerRightX - outerLeftX);
                const nx = outerLeftX + L * t; const ny = outerTopY;
                drawX = nx * eff + renderOffset.x; drawY = ny * eff + renderOffset.y;
              } else if (component.wallSide === 'bottom') {
                const L = Math.max(1e-6, outerRightX - outerLeftX);
                const nx = outerLeftX + L * t; const ny = outerBottomY;
                drawX = nx * eff + renderOffset.x; drawY = ny * eff + renderOffset.y;
              } else if (component.wallSide === 'left') {
                const L = Math.max(1e-6, outerTopY - outerBottomY);
                const ny = outerBottomY + L * t; const nx = outerLeftX;
                drawX = nx * eff + renderOffset.x; drawY = ny * eff + renderOffset.y;
              } else if (component.wallSide === 'right') {
                const L = Math.max(1e-6, outerTopY - outerBottomY);
                const ny = outerBottomY + L * t; const nx = outerRightX;
                drawX = nx * eff + renderOffset.x; drawY = ny * eff + renderOffset.y;
              }
            }
          } catch { /* ignore */ }
          // 根据墙面方向旋转，使四分之一圆朝房间内（默认朝右下象限）
          // 根据墙面方向旋转，使四分之一圆朝房间内（右下为基准）
          let rot = 0;
          const side = component.wallSide;
          if (side === 'bottom') rot = -Math.PI / 2; // 向上/右
          else if (side === 'right') rot = Math.PI / 2; // 向下/左
          else if (side === 'top') rot = 0; // 向下/右
          else if (side === 'left') rot = 0; // 向下/右
          ctx.save();
          ctx.translate(drawX, drawY);
          ctx.rotate(rot);
          // 绘制两条半径和一个 90° 圆弧（0 -> π/2），形成四分之一圆形示意
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(rArc, 0);
          ctx.moveTo(0, 0);
          ctx.lineTo(0, rArc);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, rArc, 0, Math.PI / 2);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'window': {
          // 窗：细长矩形 + 交叉线，需完全位于墙体厚度内
          const wBase = 32 * scale;       // 沿墙方向长度
          const hBase = 10 * scale;       // 法线方向厚度（将被限制到墙厚）
          // 参数化位置：按房间与 wallPos 重算中心点
          let drawX = posX, drawY = posY;
          try {
            const room = components.find(r => r && r.type === 'room' && String(r.id) === String(component.roomId));
            if (room) {
              const wRoom = room.w ?? 80; const hRoom = room.h ?? 60; const wall = Math.max(1, room.wall ?? 6);
              const cx = room.x, cy = room.y; const hx = wRoom / 2, hy = hRoom / 2;
              const innerLeftX = cx - hx + wall / 2;
              const innerRightX = cx + hx - wall / 2;
              const innerBottomY = cy - hy + wall / 2;
              const innerTopY = cy + hy - wall / 2;
              const t = Math.max(0, Math.min(1, Number(component.wallPos ?? 0.5)));
              if (component.wallSide === 'top') {
                const L = Math.max(1e-6, innerRightX - innerLeftX);
                const nx = innerLeftX + L * t; const ny = innerTopY;
                drawX = nx * eff + renderOffset.x; drawY = ny * eff + renderOffset.y;
              } else if (component.wallSide === 'bottom') {
                const L = Math.max(1e-6, innerRightX - innerLeftX);
                const nx = innerLeftX + L * t; const ny = innerBottomY;
                drawX = nx * eff + renderOffset.x; drawY = ny * eff + renderOffset.y;
              } else if (component.wallSide === 'left') {
                const L = Math.max(1e-6, innerTopY - innerBottomY);
                const ny = innerBottomY + L * t; const nx = innerLeftX;
                drawX = nx * eff + renderOffset.x; drawY = ny * eff + renderOffset.y;
              } else if (component.wallSide === 'right') {
                const L = Math.max(1e-6, innerTopY - innerBottomY);
                const ny = innerBottomY + L * t; const nx = innerRightX;
                drawX = nx * eff + renderOffset.x; drawY = ny * eff + renderOffset.y;
              }
            }
          } catch { /* ignore */ }
          ctx.save();
          ctx.translate(drawX, drawY);
          // 获取所属房间墙厚（像素）并限制窗厚度（与房间绘制一致使用 eff 缩放）
          let wallPx = Math.max(2, 6 * eff);
          try {
            const room = components.find(r => r && r.type === 'room' && String(r.id) === String(component.roomId));
            if (room && room.wall != null) wallPx = Math.max(2, room.wall * eff);
          } catch { /* ignore */ }
          const strokePad = ctx.lineWidth || 2; // 防止描边外溢
          // 厚度与墙厚保持一致（减去描边余量），不再受 hBase 上限限制
          const hClamped = Math.max(2, wallPx - strokePad);
          // 垂直墙（left/right）旋转 90 度，使厚度沿 x 方向
          const isVertical = component && (component.wallSide === 'left' || component.wallSide === 'right');
          if (isVertical) ctx.rotate(Math.PI / 2);
          // 绘制限制后的窗矩形
          ctx.beginPath();
          ctx.rect(-wBase / 2, -hClamped / 2, wBase, hClamped);
          ctx.stroke();
          // 交叉线
          ctx.beginPath();
          ctx.moveTo(-wBase / 2, -hClamped / 2);
          ctx.lineTo(wBase / 2, hClamped / 2);
          ctx.moveTo(-wBase / 2, hClamped / 2);
          ctx.lineTo(wBase / 2, -hClamped / 2);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'copperValve':
          // 铜球阀：仅绘制两个等腰三角形，不再绘制两端连接线段
          {
            const halfLen = 12 * VALVE_SIZE_FACTOR * scale;
            const halfHeight = 6 * VALVE_SIZE_FACTOR * scale;
            const ang = getAngleForComponent(component);
            // 擦除阀门占位区域，避免与原管线交叉
            {
              const erasePad = 4 * VALVE_SIZE_FACTOR * scale;
              ctx.save();
              ctx.translate(posX, posY);
              ctx.rotate(ang);
              const w = halfLen * 2;
              const h = halfHeight * 2 + erasePad * 2;
              ctx.globalCompositeOperation = 'destination-out';
              ctx.beginPath();
              ctx.rect(-halfLen, -halfHeight - erasePad, w, h);
              ctx.fill();
              ctx.restore();
              ctx.globalCompositeOperation = 'source-over';
            }
            // 绘制两个三角形轮廓
            ctx.save();
            ctx.translate(posX, posY);
            ctx.rotate(ang);
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            // 左三角
            ctx.moveTo(0, 0); ctx.lineTo(-halfLen, -halfHeight);
            ctx.moveTo(0, 0); ctx.lineTo(-halfLen, halfHeight);
            ctx.moveTo(-halfLen, -halfHeight); ctx.lineTo(-halfLen, halfHeight);
            // 右三角
            ctx.moveTo(0, 0); ctx.lineTo(halfLen, -halfHeight);
            ctx.moveTo(0, 0); ctx.lineTo(halfLen, halfHeight);
            ctx.moveTo(halfLen, -halfHeight); ctx.lineTo(halfLen, halfHeight);
            ctx.stroke();
            ctx.restore();
          }
          break;
        case 'flangeValve':
        {
          // 法兰球阀：两个等腰三角形 + 两侧法兰面竖线
          const halfLen = 12 * VALVE_SIZE_FACTOR * scale;
          const halfHeight = 6 * VALVE_SIZE_FACTOR * scale;
          const flangeGap = 3 * VALVE_SIZE_FACTOR * scale; // 三角形外缘至法兰面的间距
          const flangeHeight = halfHeight * 2 + 6 * VALVE_SIZE_FACTOR * scale; // 法兰面竖线高度，略高于阀体
          const ang = getAngleForComponent(component);
          // 擦除占位区域（包含法兰面）
          {
            const erasePad = 4 * VALVE_SIZE_FACTOR * scale;
            ctx.save();
            ctx.translate(posX, posY);
            ctx.rotate(ang);
            const w = halfLen * 2 + flangeGap * 2;
            const h = Math.max(flangeHeight, halfHeight * 2) + erasePad * 2;
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.rect(-halfLen - flangeGap, -h / 2, w, h);
            ctx.fill();
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
          }
          // 绘制阀体（三角形）与法兰面竖线
          ctx.save();
          ctx.translate(posX, posY);
          ctx.rotate(ang);
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'miter';
          ctx.beginPath();
          // 左三角
          ctx.moveTo(0, 0); ctx.lineTo(-halfLen, -halfHeight);
          ctx.moveTo(0, 0); ctx.lineTo(-halfLen, halfHeight);
          ctx.moveTo(-halfLen, -halfHeight); ctx.lineTo(-halfLen, halfHeight);
          // 右三角
          ctx.moveTo(0, 0); ctx.lineTo(halfLen, -halfHeight);
          ctx.moveTo(0, 0); ctx.lineTo(halfLen, halfHeight);
          ctx.moveTo(halfLen, -halfHeight); ctx.lineTo(halfLen, halfHeight);
          // 法兰面竖线（两侧）
          ctx.moveTo(-halfLen - flangeGap, -flangeHeight / 2);
          ctx.lineTo(-halfLen - flangeGap, flangeHeight / 2);
          ctx.moveTo(halfLen + flangeGap, -flangeHeight / 2);
          ctx.lineTo(halfLen + flangeGap, flangeHeight / 2);
          ctx.stroke();
          ctx.restore();
        }
        break;
      case 'explosionProofValve':
        {
          // 防爆电磁球阀：阀体形状与铜球阀一致，在连接处添加带"S"标识的方形框
          const halfLen = 12 * VALVE_SIZE_FACTOR * scale;
          const halfHeight = 6 * VALVE_SIZE_FACTOR * scale;
          const ang = getAngleForComponent(component);
          
          // 擦除阀门占位区域，避免与原管线交叉
          {
            const erasePad = 4 * VALVE_SIZE_FACTOR * scale;
            ctx.save();
            ctx.translate(posX, posY);
            ctx.rotate(ang);
            const w = halfLen * 2;
            const h = halfHeight * 2 + erasePad * 2;
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.rect(-halfLen, -halfHeight - erasePad, w, h);
            ctx.fill();
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
          }
          
          ctx.save();
          ctx.translate(posX, posY);
          ctx.rotate(ang);
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'miter';
          
          // 1. 绘制两个三角形轮廓（与铜球阀相同）
          ctx.beginPath();
          // 左三角
          ctx.moveTo(0, 0); ctx.lineTo(-halfLen, -halfHeight);
          ctx.moveTo(0, 0); ctx.lineTo(-halfLen, halfHeight);
          ctx.moveTo(-halfLen, -halfHeight); ctx.lineTo(-halfLen, halfHeight);
          // 右三角
          ctx.moveTo(0, 0); ctx.lineTo(halfLen, -halfHeight);
          ctx.moveTo(0, 0); ctx.lineTo(halfLen, halfHeight);
          ctx.moveTo(halfLen, -halfHeight); ctx.lineTo(halfLen, halfHeight);
          ctx.stroke();
          
          // 2. 在两个三角形的连接处（中心点）绘制带"S"标识的方形框
          // 注意：不要用不透明白色填充（会在导出时产生白底），应先擦除方框内部以保持透明，
          // 然后再描边与绘制标识文字。
          const boxSize = 8 * VALVE_SIZE_FACTOR * scale;
          // 擦除方框内部（保持透明）
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.rect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
          ctx.fill();
          ctx.restore();

          // 描边方框
          ctx.beginPath();
          ctx.strokeStyle = '#000000';
          ctx.rect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
          ctx.stroke();
          
          // 3. 在方形框内绘制"S"标识
          const fontSize = Math.max(6, boxSize * 0.5);
          ctx.fillStyle = '#000000';
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S', 0, 0);
          
          ctx.restore();
        }
        break;
      case 'regulator':
        {
          // 调压箱绘制在线段端点处，随最近管段方向旋转，写入规格文本
          const w = 34 * scale;
          const h = 22 * scale;
          // 需求变更：调压箱不参与随管线旋转，固定为画布坐标系方向
          const ang = 0;
          // 先擦除底层，使盒体内部透明，不遮挡管线
          ctx.save();
          ctx.translate(posX, posY);
          ctx.rotate(ang);
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.rect(-w / 2, -h / 2, w, h);
          ctx.fill();
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';

          // 绘制外框（仅描边，不填充）
          ctx.save();
          ctx.translate(posX, posY);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.rect(-w / 2, -h / 2, w, h);
          ctx.stroke();
          const spec = (component.regulatorSpec || '').replace(/^RX/, 'RX');
          if (spec) {
            const BASE_FONT = 10;
            const fontPx = Math.round(BASE_FONT * scale);
            ctx.fillStyle = '#000000';
            ctx.font = `${fontPx}px PingFang SC`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(spec, 0, 0);
          }
          // 底部两个连接点的可视标记
          const markerR = Math.max(1.5, 2 * scale);
          const inset = 4 * scale;
          ctx.beginPath();
          ctx.arc(-w / 2 + inset, h / 2, markerR, 0, Math.PI * 2);
          ctx.arc(w / 2 - inset, h / 2, markerR, 0, Math.PI * 2);
          ctx.fillStyle = '#222';
          ctx.fill();
          ctx.restore();
        }
        break;
      case 'meter':
        {
          // 使燃气表沿最近管段方向旋转，并在矩形内写入规格文本
          const w = 30 * scale;
          const h = 20 * scale;
          let ang = getAngleForComponent(component);
          // 计算所属管段并基于法线方向偏移中心，用于连接与擦除（适配水平/垂直/斜线）
          const renderScale = (exportingRef.current && exportTransformRef.current.scale != null)
            ? exportTransformRef.current.scale
            : scale;
          const effLocal = renderScale * BASE_VISUAL_SCALE;
          const renderOffsetLocal = (exportingRef.current && exportTransformRef.current.offset)
            ? exportTransformRef.current.offset
            : canvasOffset;
          const segId = component.segmentId;
          let seg = null;
          if (segId) seg = segments.find(s => s.id === segId);
          if (!seg) {
            // 使用世界坐标做最近段判定
            let bestSeg = null;
            let bestDist = Infinity;
            for (const s of segments) {
              const d = (function(px, py, x1, y1, x2, y2) {
                const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
                const dot = A * C + B * D; const lenSq = C * C + D * D;
                let param = -1; if (lenSq !== 0) param = dot / lenSq;
                let xx, yy; if (param < 0) { xx = x1; yy = y1; }
                else if (param > 1) { xx = x2; yy = y2; }
                else { xx = x1 + param * C; yy = y1 + param * D; }
                return Math.hypot(px - xx, py - yy);
              })(component.x, component.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
              if (d < bestDist) { bestDist = d; bestSeg = s; }
            }
            seg = bestSeg;
          }
          const sA = seg ? Math.atan2(seg.endPoint.y - seg.startPoint.y, seg.endPoint.x - seg.startPoint.x) : 0;
          const nX = -Math.sin(sA);
          const nY = Math.cos(sA);
          const offsetMargin = 6 * scale; // 顶部圆点到管线的最小可视间距
          // 侧别控制：左表沿管段“左法线”偏移，右表沿“右法线”偏移
          // 左法线定义为将管段方向向量逆时针旋转90°所得；右法线则顺时针旋转90°
          const sideSign = (component.meterSide === '右表') ? -1 : 1; // 默认左表（含未设置时）
          // 旋转角度：令“顶部”（有小圆点的一侧）始终朝向管线
          // 实现方式：当右表时在管段方向基础上加 π，使局部坐标的顶部指向管线
          ang = sA + (sideSign === -1 ? Math.PI : 0);
          let drawPosX = posX;
          let drawPosY = posY;
          if (seg) {
            drawPosX = posX + sideSign * nX * (h / 2 + offsetMargin);
            drawPosY = posY + sideSign * nY * (h / 2 + offsetMargin);
          }

          // 先擦除底层，使表体内部透明，不遮挡管线
          ctx.save();
          ctx.translate(drawPosX, drawPosY);
          ctx.rotate(ang);
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.rect(-w / 2, -h / 2, w, h);
          ctx.fill();
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';

          // 绘制外框（仅描边，不填充）
          ctx.save();
          ctx.translate(drawPosX, drawPosY);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.rect(-w / 2, -h / 2, w, h);
          ctx.stroke();
          // 文本
          const spec = (component.meterSpec || '').replace(/^G/, 'G');
          if (spec) {
            const BASE_FONT = 10;
            const fontPx = Math.round(BASE_FONT * scale);
            ctx.fillStyle = '#000000';
            ctx.font = `${fontPx}px PingFang SC`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(spec, 0, 0);
          }
          // 顶部两个连接点的可视标记（仿照调压箱底部样式）
          const markerR = Math.max(1.5, 2 * scale);
          const inset = 4 * scale;
          ctx.beginPath();
          ctx.arc(-w / 2 + inset, -h / 2, markerR, 0, Math.PI * 2);
          ctx.arc(w / 2 - inset, -h / 2, markerR, 0, Math.PI * 2);
          ctx.fillStyle = '#222';
          ctx.fill();
          ctx.restore();

          // 计算顶部两圆点对应的管线上垂足（画布坐标），并绘制连接与擦除（通用：水平/垂直/斜线）
          const cosA = Math.cos(ang), sinA = Math.sin(ang);
          const topLeftLocal = { x: -w / 2 + inset, y: -h / 2 };
          const topRightLocal = { x: w / 2 - inset, y: -h / 2 };
          const rotToCanvas = (dx, dy) => ({
            x: drawPosX + dx * cosA - dy * sinA,
            y: drawPosY + dx * sinA + dy * cosA,
          });
          const topLeftCanvas = rotToCanvas(topLeftLocal.x, topLeftLocal.y);
          const topRightCanvas = rotToCanvas(topRightLocal.x, topRightLocal.y);
          if (seg) {
            // 管段端点（画布坐标）
            const x1 = seg.startPoint.x * effLocal + renderOffsetLocal.x;
            const y1 = seg.startPoint.y * effLocal + renderOffsetLocal.y;
            const x2 = seg.endPoint.x * effLocal + renderOffsetLocal.x;
            const y2 = seg.endPoint.y * effLocal + renderOffsetLocal.y;
            const dx = x2 - x1, dy = y2 - y1;
            const lenSq = dx * dx + dy * dy || 1;
            const projectToSeg = (p) => {
              let t = ((p.x - x1) * dx + (p.y - y1) * dy) / lenSq;
              if (t < 0) t = 0; else if (t > 1) t = 1;
              return { x: x1 + t * dx, y: y1 + t * dy };
            };
            const footL = projectToSeg(topLeftCanvas);
            const footR = projectToSeg(topRightCanvas);

            // 先擦除两连接点的垂足之间的管线（按管段方向擦除带）
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.moveTo(footL.x, footL.y);
            ctx.lineTo(footR.x, footR.y);
            ctx.lineWidth = 8; // 擦除宽度（像素），与水平情形一致
            if (ctx.setLineDash) ctx.setLineDash([]);
            ctx.stroke();
            ctx.restore();

            // 绘制从两个圆点到管线垂足的连接线（颜色/虚线风格随管段）
            const color = exportingRef.current
              ? '#000000'
              : (diameterColorMap[seg.diameter] || '#000000');
            const useDash = isPEMaterial(seg.material);
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            if (ctx.setLineDash) {
              if (useDash) ctx.setLineDash([8, 6]); else ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.moveTo(topLeftCanvas.x, topLeftCanvas.y);
            ctx.lineTo(footL.x, footL.y);
            ctx.moveTo(topRightCanvas.x, topRightCanvas.y);
            ctx.lineTo(footR.x, footR.y);
            ctx.stroke();
            ctx.restore();
          }
        }
        break;
      case 'heatShrinkSleeve':
        {
          // 热收缩套：沿最近管段方向的长条矩形（描边，不填充），并擦除内部以保持管线可见
          const w = 36 * VALVE_SIZE_FACTOR * scale;
          const h = 10 * VALVE_SIZE_FACTOR * scale;
          const ang = getAngleForComponent(component);
          // 擦除内部区域
          ctx.save();
          ctx.translate(posX, posY);
          ctx.rotate(ang);
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.rect(-w / 2, -h / 2, w, h);
          ctx.fill();
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';

          // 绘制外框描边
          ctx.save();
          ctx.translate(posX, posY);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.rect(-w / 2, -h / 2, w, h);
          ctx.stroke();
          ctx.restore();
        }
        break;
      case 'pillar': {
        // 立柱（工字形）：顶部交点为锚点，竖线向下。特殊元素：不随管线旋转
        const totalH = 30 * VALVE_SIZE_FACTOR * scale; // 保持与旧矩形近似视觉高度
        const vLen = totalH * 0.8; // 竖线长度更长
        const hLenEach = vLen * 0.4; // 水平线更短

        ctx.save();
        ctx.translate(posX, posY);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        // 1) 中间竖直线（自顶部交点向下）
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, vLen);
        ctx.stroke();

        // 2) 顶部水平线（以锚点为中心）
        ctx.beginPath();
        ctx.moveTo(-hLenEach, 0);
        ctx.lineTo(hLenEach, 0);
        ctx.stroke();

        // 3) 底部水平线（在竖线末端）
        ctx.beginPath();
        ctx.moveTo(-hLenEach, vLen);
        ctx.lineTo(hLenEach, vLen);
        ctx.stroke();

        ctx.restore();
        break;
      }

      case 'junction': {
        // 接驳点：黄色呼吸灯圆环 + 实心点（导出时隐藏，保持与红/蓝圆点一致）
        if (!exportingRef.current) {
          const breathingSize = Math.sin(breathingPhase) * 2 + 6;
          ctx.beginPath();
          ctx.arc(posX, posY, breathingSize, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(234, 179, 8, 0.35)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(posX, posY, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
        }
        break;
      }

      case 'blockage': {
        // 绘制为一条短线，且始终与所在线段垂直
        const L = 14 * scale; // 短线总长度（像素级，随缩放调整）
        const ang = getAngleForComponent(component);
        ctx.save();
        ctx.translate(posX, posY);
        // 旋转到与管段垂直的方向
        ctx.rotate(ang + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(-L / 2, 0);
        ctx.lineTo(L / 2, 0);
        ctx.stroke();
        ctx.restore();
      }
      break;
      default:
        ctx.arc(posX, posY, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    }
  };

  const drawFitting = (ctx, fitting, isSelected) => {
    const { x, y, type } = fitting;
    const renderScale = (exportingRef.current && exportTransformRef.current.scale != null)
      ? exportTransformRef.current.scale
      : scale;
    const eff = renderScale * BASE_VISUAL_SCALE;
    const renderOffset = (exportingRef.current && exportTransformRef.current.offset)
      ? exportTransformRef.current.offset
      : canvasOffset;
    const posX = x * eff + renderOffset.x;
    const posY = y * eff + renderOffset.y;
    // 配件绘制前重置线型，避免继承管段虚线
    if (ctx.setLineDash) ctx.setLineDash([]);
    ctx.beginPath();
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeStyle = isSelected ? '#ff0000' : '#000000';
    ctx.fillStyle = '#ffffff';
    // 不在平面图中绘制活接（平面视图应隐藏活接）
    if (isPlaneView && type === 'union') return;

    switch (type) {
      case 'elbow':
        try {
          let ang = 0;
          if (fitting.segmentId) {
            const seg = segments.find(s => s && String(s.id) === String(fitting.segmentId));
            if (seg) {
              ang = Math.atan2(seg.endPoint.y - seg.startPoint.y, seg.endPoint.x - seg.startPoint.x);
            } else {
              ang = getNearestPipeAngle({ x: posX, y: posY });
            }
          } else {
            ang = getNearestPipeAngle({ x: posX, y: posY });
          }
          const L = 14 * scale;
          ctx.save();
          ctx.translate(posX, posY);
          ctx.rotate(ang + Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(L, 0);
          ctx.stroke();
          ctx.restore();
        } catch (e) {
          ctx.moveTo(posX - 5, posY); ctx.lineTo(posX + 5, posY);
          ctx.moveTo(posX, posY - 5); ctx.lineTo(posX, posY + 5);
        }
        break;
      case 'tee':
        // 绘制与被插入管线垂直的短线：常规情况下绘制单侧；
        // 若三通位于管线端点，则改为双侧短线，便于区分端部三通。
        try {
          let ang = 0;
          const ENDPOINT_EPS = 3; // 世界坐标端点容差，与管线节点阈值保持一致
          const nearEndpoint = (seg) => {
            if (!seg) return false;
            const near = (pt) => Math.hypot(x - pt.x, y - pt.y) <= ENDPOINT_EPS;
            return near(seg.startPoint) || near(seg.endPoint);
          };
          let hostingSegment = null;
          if (fitting.segmentId) {
            hostingSegment = segments.find(s => s && String(s.id) === String(fitting.segmentId)) || null;
          }
          if (hostingSegment) {
            ang = Math.atan2(hostingSegment.endPoint.y - hostingSegment.startPoint.y, hostingSegment.endPoint.x - hostingSegment.startPoint.x);
          } else {
            ang = getNearestPipeAngle({ x: posX, y: posY });
          }
          let drawBothSides = hostingSegment ? nearEndpoint(hostingSegment) : false;
          if (!drawBothSides) {
            for (const seg of segments) {
              if (!seg) continue;
              if (nearEndpoint(seg)) { drawBothSides = true; break; }
            }
          }
          const L = 14 * scale; // 短线像素长度基准
          ctx.save();
          ctx.translate(posX, posY);
          ctx.rotate(ang + Math.PI / 2);
          ctx.beginPath();
          if (drawBothSides) {
            ctx.moveTo(-L, 0);
            ctx.lineTo(L, 0);
          } else {
            ctx.moveTo(0, 0);
            ctx.lineTo(L, 0);
          }
          ctx.stroke();
          ctx.restore();
        } catch (e) {
          // 回退：绘制小十字
          ctx.moveTo(posX - 5, posY); ctx.lineTo(posX + 5, posY);
          ctx.moveTo(posX, posY - 5); ctx.lineTo(posX, posY + 5);
        }
        break;
      case 'reducer':
        ctx.moveTo(posX - 5, posY - 5); ctx.lineTo(posX + 5, posY + 5);
        ctx.moveTo(posX - 5, posY + 5); ctx.lineTo(posX + 5, posY - 5); break;
      case 'union':
        // 活接：导出时内部需要保持透明（擦除），平面图中不绘制
        // 在导出时先擦除内部，再描边；在常规视图下保持实心圆
        try {
          const radius = 4;
          if (exportingRef.current) {
            // 擦除内部保持透明
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(posX, posY, Math.max(0, radius - 1), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // 描边圆环
            ctx.beginPath();
            ctx.arc(posX, posY, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(posX, posY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        } catch (e) {
          // fallback: 小圆点
          ctx.beginPath(); ctx.arc(posX, posY, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        // 已完成绘制，跳过函数尾部的默认 fill/stroke
        return;
      default:
        ctx.arc(posX, posY, 3, 0, Math.PI * 2); break;
    }
    ctx.fill();
    ctx.stroke();
  };

  const drawCurrentPoint = (ctx) => {
    const eff = scale * BASE_VISUAL_SCALE;
    const cp = currentPoint || { x: 200, y: 200 };
    const x = cp.x * eff + canvasOffset.x;
    const y = cp.y * eff + canvasOffset.y;
    const breathingSize = Math.sin(breathingPhase) * 2 + 6;
    ctx.beginPath();
    ctx.arc(x, y, breathingSize, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 38, 38, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ff0000';
    ctx.fill();
  };

  // 主体管线层：绘制同材质异径连接处的等边三角符号，顶点指向小管径
  const drawReducerTrianglesMainLayer = (ctx) => {
    const renderScale = (exportingRef.current && exportTransformRef.current.scale != null)
      ? exportTransformRef.current.scale
      : scale;
    const eff = renderScale * BASE_VISUAL_SCALE;
    const renderOffset = (exportingRef.current && exportTransformRef.current.offset)
      ? exportTransformRef.current.offset
      : canvasOffset;
    const toCanvas = (p) => ({ x: p.x * eff + renderOffset.x, y: p.y * eff + renderOffset.y });




    const nodeMap = new Map();
    const keyOf = (p) => `${p.x},${p.y}`;
    segments.forEach(seg => {
      const addInc = (ptFrom, ptTo) => {
        const vx = ptTo.x - ptFrom.x;
        const vy = ptTo.y - ptFrom.y;
        let angle = (Math.atan2(vy, vx) * 180) / Math.PI;
        if (angle < 0) angle += 360;
        const list = nodeMap.get(keyOf(ptFrom)) || [];
        list.push({ material: seg.material, diameter: seg.diameter, angle, world: ptFrom });
        nodeMap.set(keyOf(ptFrom), list);
      };
      addInc(seg.startPoint, seg.endPoint);
      addInc(seg.endPoint, seg.startPoint);
    });

    nodeMap.forEach((incs) => {
      if (!Array.isArray(incs) || incs.length !== 2) return;
      const i1 = incs[0];
      const i2 = incs[1];
      const g1 = normalizeMaterialGroup(i1.material);
      const g2 = normalizeMaterialGroup(i2.material);
      if (g1 !== g2) return; // 仅同材质
      const dnum1 = parseDiameterNumeric(i1.diameter);
      const dnum2 = parseDiameterNumeric(i2.diameter);
      if (dnum1 === dnum2) return; // 仅异径
      // 角度判定：仅直通（近似180度）时绘制三角符号
      const diff = Math.abs(i1.angle - i2.angle) % 360;
      const diffDeg = diff > 180 ? 360 - diff : diff;
      const STRAIGHT_TOL = 15;
      const isStraightThrough = diffDeg >= (180 - STRAIGHT_TOL);
      if (!isStraightThrough) return;

      const pos = toCanvas(incs[0].world);
      const smallInc = dnum1 <= dnum2 ? i1 : i2;
      const angRad = (smallInc.angle * Math.PI) / 180;
      const side = 12 * renderScale; // 三角形边长随缩放
      // 等边三角形高度
      const height = Math.sqrt(3) / 2 * side;
      // 以节点位置为三角形重心（centroid），使尖端朝向小径方向
      // 从重心到顶点的距离为 2/3 * height，重心到底边中心的距离为 1/3 * height
      const apex = { x: pos.x + Math.cos(angRad) * (2 * height / 3), y: pos.y + Math.sin(angRad) * (2 * height / 3) };
      const baseCenter = { x: pos.x - Math.cos(angRad) * (height / 3), y: pos.y - Math.sin(angRad) * (height / 3) };
      const nx = Math.cos(angRad + Math.PI / 2);
      const ny = Math.sin(angRad + Math.PI / 2);
      const halfBase = side / 2;
      const p1 = { x: baseCenter.x + nx * halfBase, y: baseCenter.y + ny * halfBase };
      const p2 = { x: baseCenter.x - nx * halfBase, y: baseCenter.y - ny * halfBase };

      // 先擦除底部占位区域，避免管线穿过符号影响视觉层级
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(apex.x, apex.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 仅描边（内部保持透明）以满足可见但不遮挡管线的需求
      ctx.beginPath();
      ctx.moveTo(apex.x, apex.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  };
  const drawDesignStartPoint = (ctx) => {
    const eff = scale * BASE_VISUAL_SCALE;
    const sp = (typeof designStartPoint === 'object' && designStartPoint) ? designStartPoint : { x: 200, y: 200 };
    const x = sp.x * eff + canvasOffset.x;
    const y = sp.y * eff + canvasOffset.y;
    const breathingSize = Math.sin(breathingPhase) * 2 + 6;
    ctx.beginPath();
    ctx.arc(x, y, breathingSize, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(29, 78, 216, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#1d4ed8';
    ctx.fill();
  };



  /* eslint-disable-next-line no-unused-vars */
  const drawSelectedEndpointIndicator = (ctx) => {
    // 已弃用：端点选中红光逻辑改为 currentPoint 的红色呼吸光显示
    return;
  };

  // 在平面图导出时绘制右上角的北向标（圆形透明背景，内部为黑色扇形，正上方有“北”字）
  const drawNorthArrow = (ctx) => {
    const dpr = (exportingRef.current && exportTransformRef.current && exportTransformRef.current.dpr)
      ? exportTransformRef.current.dpr
      : (globalThis.devicePixelRatio || 1);
    const canvasW = ctx.canvas.width / dpr;
    const canvasH = ctx.canvas.height / dpr;
    const renderScale = (exportingRef.current && exportTransformRef.current.scale != null)
      ? exportTransformRef.current.scale
      : scale;
    const eff = renderScale * BASE_VISUAL_SCALE;
    const renderOffset = (exportingRef.current && exportTransformRef.current.offset)
      ? exportTransformRef.current.offset
      : canvasOffset;

    // 计算渲染内容的包围盒（画布坐标，包含管线/设备/配件 + 标签矩形）
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    try {
      segments.forEach(s => {
        const x1 = s.startPoint.x * eff + renderOffset.x;
        const y1 = s.startPoint.y * eff + renderOffset.y;
        const x2 = s.endPoint.x * eff + renderOffset.x;
        const y2 = s.endPoint.y * eff + renderOffset.y;
        minX = Math.min(minX, x1, x2); minY = Math.min(minY, y1, y2);
        maxX = Math.max(maxX, x1, x2); maxY = Math.max(maxY, y1, y2);
      });
      components.forEach(c => {
        const px = c.x * eff + renderOffset.x;
        const py = c.y * eff + renderOffset.y;
        minX = Math.min(minX, px); minY = Math.min(minY, py);
        maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
      });
      fittings.forEach(f => {
        const px = f.x * eff + renderOffset.x;
        const py = f.y * eff + renderOffset.y;
        minX = Math.min(minX, px); minY = Math.min(minY, py);
        maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
      });
    } catch (e) {
      minX = Infinity; // 防御性回退到默认处理下方
    }

    // 合并标签矩形（已是画布坐标）
    try {
      const rects = Array.isArray(labelLayoutsRef.current) ? labelLayoutsRef.current.map(l => l.rect) : [];
      if (rects.length) {
        const rMinX = Math.min(...rects.map(r => r.x1));
        const rMinY = Math.min(...rects.map(r => r.y1));
        const rMaxX = Math.max(...rects.map(r => r.x2));
        const rMaxY = Math.max(...rects.map(r => r.y2));
        minX = Math.min(minX, rMinX);
        minY = Math.min(minY, rMinY);
        maxX = Math.max(maxX, rMaxX);
        maxY = Math.max(maxY, rMaxY);
      }
    } catch (e) { /* ignore */ }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      // 内容为空或计算失败：用中间区域作为主内容区，确保北向标放在安全空白区
      minX = canvasW * 0.25; minY = canvasH * 0.25; maxX = canvasW * 0.75; maxY = canvasH * 0.75;
    }

    const marginFromContent = 24; // 与主体保持的最小间距（像素）
    const radius = Math.max(18, Math.min(64, Math.round(Math.min(canvasW, canvasH) * 0.06)));
    // 文字大小提前计算，用于确保顶部留白足够容纳“北”字
    const fontPx = Math.max(12, Math.round(radius * 0.5));
    const topTextGap = 6; // 文本与圆之间的间距

    // helper: test intersection between candidate circle+text bbox and expanded content bbox
    const expand = (pad) => ({ x1: minX - pad, y1: minY - pad, x2: maxX + pad, y2: maxY + pad });
    const contentBox = expand(marginFromContent);
    const candidateIntersects = (cx, cy) => {
      const left = cx - radius;
      const right = cx + radius;
      const top = cy - radius - fontPx - topTextGap; // include space for '北' above
      const bottom = cy + radius;
      return !(right < contentBox.x1 || left > contentBox.x2 || bottom < contentBox.y1 || top > contentBox.y2);
    };

    // candidate positions preference: top-right, top-left, bottom-right, bottom-left
    const paddingEdge = 8;
    const positions = [
      { cx: canvasW - radius - paddingEdge, cy: radius + fontPx + topTextGap + paddingEdge }, // top-right corner
      { cx: radius + paddingEdge, cy: radius + fontPx + topTextGap + paddingEdge }, // top-left corner
      { cx: canvasW - radius - paddingEdge, cy: canvasH - radius - paddingEdge }, // bottom-right corner
      { cx: radius + paddingEdge, cy: canvasH - radius - paddingEdge } // bottom-left corner
    ];

    let chosen = null;
    for (const p of positions) {
      // clamp within canvas and ensure top text padding
      const pcx = Math.max(radius + paddingEdge, Math.min(canvasW - radius - paddingEdge, p.cx));
      const pcy = Math.max(radius + fontPx + topTextGap + paddingEdge, Math.min(canvasH - radius - paddingEdge, p.cy));
      if (!candidateIntersects(pcx, pcy)) { chosen = { cx: pcx, cy: pcy }; break; }
    }
    // fallback: place to the right of content bbox if possible, otherwise use top-right clamped
    if (!chosen) {
      let attemptCx = Math.min(canvasW - radius - paddingEdge, maxX + marginFromContent + radius);
      let attemptCy = Math.max(radius + fontPx + topTextGap + paddingEdge, minY - marginFromContent - radius);
      attemptCx = Math.max(radius + paddingEdge, Math.min(canvasW - radius - paddingEdge, attemptCx));
      attemptCy = Math.max(radius + fontPx + topTextGap + paddingEdge, Math.min(canvasH - radius - paddingEdge, attemptCy));
      if (!candidateIntersects(attemptCx, attemptCy)) {
        chosen = { cx: attemptCx, cy: attemptCy };
      } else {
        // final fallback: top-right clamped (guaranteed visible, may overlap if impossible to avoid)
        chosen = { cx: canvasW - radius - paddingEdge, cy: radius + fontPx + topTextGap + paddingEdge };
      }
    }

    const cx = chosen.cx;
    const cy = chosen.cy;

    ctx.save();
    // 绘制圆圈外框（不填充，保持透明背景）
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 在圆内绘制扇形：尖部位于圆的上顶点，底边为该圆底部的一段圆弧
    const tip = { x: cx, y: cy - radius }; // 圆上顶点
    const beta = Math.PI * 0.18; // 扇形覆盖底部圆弧的半开角（约 32.4°）
    const thL = Math.PI / 2 - beta; // 左端点角度
    const thR = Math.PI / 2 + beta; // 右端点角度
    const exL = cx + Math.cos(thL) * radius;
    const eyL = cy + Math.sin(thL) * radius;
    const exR = cx + Math.cos(thR) * radius;
    const eyR = cy + Math.sin(thR) * radius;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(exL, eyL);
    ctx.arc(cx, cy, radius, thL, thR);
    ctx.lineTo(tip.x, tip.y);
    ctx.closePath();
    ctx.fillStyle = '#000000';
    ctx.fill();

    // 在圆的正上方绘制“北”字，保证与圆体有一定间距
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${fontPx}px PingFang SC, system-ui, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('北', cx, cy - radius - topTextGap);
    ctx.restore();
  };

  const drawAllImpl = (ctx, withSelection = true) => {
    segments.forEach(segment => {
      const isSel = withSelection && segment === selectedSegment;
      drawSegment(ctx, segment, isSel);
    });
    components.forEach(component => {
      const isSel = withSelection && component === selectedComponent;
      drawComponent(ctx, component, isSel);
    });
    fittings.forEach(fitting => {
      const isSel = withSelection && fitting === selectedFitting;
      drawFitting(ctx, fitting, isSel);
    });
    // 导出模式下不绘制红蓝圆点
    if (!exportingRef.current) {
      drawDesignStartPoint(ctx);
      drawCurrentPoint(ctx);
    }
    // 主体管线层：同材质异径连接处绘制等边三角符号（顶点指向小管径）
    drawReducerTrianglesMainLayer(ctx);
    if (showLabels) {
      drawLeaderLabels(ctx);
    }
    if (withSelection && !exportingRef.current) {
      drawMoveHandles(ctx);
    }
    // 导出时在平面视图右上角绘制北向标（透明圆背景，扇形尖端朝上）
    try {
      if (isPlaneView && exportingRef.current) {
        drawNorthArrow(ctx);
      }
    } catch (e) { /* ignore drawing errors for north arrow */ }
  };
  drawAllRef.current = drawAllImpl;

  // 动画定时器：呼吸灯
  useEffect(() => {
    const interval = setInterval(() => {
      setBreathingPhase(prev => (prev + 0.1) % (Math.PI * 2));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // 执行一次绘制逻辑已移至 rAF effect 内（performDraw）

  // rAF 调度：合并多次状态更新为单帧绘制，减少闪烁
  useEffect(() => {
    needsRedrawRef.current = true;
    const performDraw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = globalThis.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth || canvas.offsetWidth || canvas.width;
      const displayHeight = canvas.clientHeight || canvas.offsetHeight || canvas.height;
      const neededWidth = Math.max(1, Math.floor(displayWidth * dpr));
      const neededHeight = Math.max(1, Math.floor(displayHeight * dpr));

      if (canvas.width !== neededWidth || canvas.height !== neededHeight) {
        canvas.width = neededWidth;
        canvas.height = neededHeight;
      }
      let offscreen = offscreenRef.current;
      if (!offscreen) {
        offscreen = document.createElement('canvas');
        offscreenRef.current = offscreen;
      }
      if (offscreen.width !== neededWidth || offscreen.height !== neededHeight) {
        offscreen.width = neededWidth;
        offscreen.height = neededHeight;
      }

      const offCtx = offscreen.getContext('2d');
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      offCtx.clearRect(0, 0, displayWidth, displayHeight);
      if (drawAllRef.current) {
        try {
          drawAllRef.current(offCtx, true);
        } catch (err) {
          // 避免单个渲染错误导致整个应用崩溃
          console.error('Error during canvas drawing:', err);
        }
      }

      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0);
    };
    if (!rafIdRef.current) {
      const loop = () => {
        rafIdRef.current = 0;
        if (needsRedrawRef.current) {
          performDraw();
          needsRedrawRef.current = false;
        }
      };
      rafIdRef.current = requestAnimationFrame(loop);
    }
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [segments, components, fittings, showLabels, scale, canvasOffset, selectedSegment, selectedComponent, selectedFitting, selectedEndpoint, breathingPhase, currentPoint, labelVisibility]);

  // === 多重引线标注系统 ===
  const drawLeaderLabels = (ctx) => {
    // 收集标注项：段、组件、配件
    // 清空本帧的标签布局缓存
    labelLayoutsRef.current = [];
    // 清空并准备本帧的引线把手缓存（tip/elbow/anchor），以便绘制与命中测试
    leaderHandlesRef.current = [];
    const renderScale = (exportingRef.current && exportTransformRef.current.scale != null)
      ? exportTransformRef.current.scale
      : scale;
    const eff = renderScale * BASE_VISUAL_SCALE;
    const renderOffset = (exportingRef.current && exportTransformRef.current.offset)
      ? exportTransformRef.current.offset
      : canvasOffset;
    const toCanvas = (p) => ({ x: p.x * eff + renderOffset.x, y: p.y * eff + renderOffset.y });
    // 标注绘制统一使用实线
    if (ctx.setLineDash) ctx.setLineDash([]);

    // visibleItems: collection of items that are actually considered for label layout & rendering
    // This starts as the union of segments/components/fittings/etc and will be filtered
    let visibleItems = [];
    // 段：材质/直径、长度
    segments.forEach(s => {
      const a = toCanvas(s.startPoint);
      const b = toCanvas(s.endPoint);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const lines = [];
      const main = `${s.material} ${formatDiameterForDisplay(s.diameter, { material: s.material })}`.trim();
      if (main) lines.push(main);
        const segLen = (typeof s.length === 'number') ? Number(s.length) : null;
        if (segLen !== null) lines.push(`${segLen.toFixed(2)}m`);
      // 如果没有任何可显示的文本（例如无材质/口径/长度），跳过生成空白标注
      if (lines.length > 0) {
        visibleItems.push({ anchor: center, type: 'segment', lines, key: `segment:${s.id}`, segmentId: s.id });
      }
    });
    // 组件：类型与关键尺寸/技术要求
    components.forEach(c => {
      const pos = toCanvas({ x: c.x, y: c.y });
      const lines = [];
      const d = c.diameter || '';
      // For valve/component types, format diameter according to material/component rules
      const dDisplay = formatDiameterForDisplay(d, { componentType: c.type });
      if (c.type === 'flangeValve') {
        const main = `法兰球阀 ${dDisplay}`.trim();
        if (main) lines.push(main);
      } else if (c.type === 'copperValve') {
        const main = `铜球阀 ${dDisplay}`.trim();
        if (main) lines.push(main);
      } else if (c.type === 'explosionProofValve') {
        const main = `防爆电磁球阀 ${dDisplay}`.trim();
        if (main) lines.push(main);
      } else if (c.type === 'heatShrinkSleeve') {
        const main = `热收缩套 ${dDisplay}`.trim();
        if (main) lines.push(main);
      } else if (c.type === 'junction') {
        const idText = c.junctionId ? String(c.junctionId).trim() : '';
        const main = idText ? `接驳点 ${idText}` : '接驳点';
        lines.push(main);
      } else if (c.type === 'meter') {
        // 物联网表：显示规格（不显示所在管段管径）
        const parts = [];
        parts.push('燃气表');
        if (c.meterSpec) parts.push(c.meterSpec);
        if (c.meterSide) parts.push(c.meterSide);
        const main = parts.join(' ').trim();
        if (main) lines.push(main);
      } else if (c.type === 'regulator') {
        // 调压箱：显示规格，如“调压箱 RX25”
        const spec = c.regulatorSpec ? `${c.regulatorSpec}`.trim() : '';
        const main = spec ? `调压箱 ${spec}` : '调压箱';
        lines.push(main);
      } else if (c.type === 'pillar') {
        // 立柱引线标注：显示管径、高度和数量
        const dia = (c.diameter || '').trim();
        const hNum = typeof c.height === 'number' ? c.height : null;
        const qty = typeof c.quantity === 'number' ? c.quantity : 1;
        const hText = hNum != null ? `${hNum.toFixed(2)}m` : '';
        const main = `立柱 ${dia}${hText ? `（${hText}）` : ''} ×${qty}`.trim();
        if (main) lines.push(main);
      } else if (c.type === 'blockage') {
        // 封堵：标注由所在线段材质与规格决定
        let seg = null;
        if (c.segmentId) seg = segments.find(s => s.id === c.segmentId);
        if (!seg) {
          // 找最近的管段
          let minD = Infinity;
          for (const s of segments) {
            const d0 = distancePointToSegment(c.x, c.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
            if (d0 < minD) { minD = d0; seg = s; }
          }
        }
        if (seg) {
          const group = normalizeMaterialGroup(seg.material);
          const dia = seg.diameter || '';
          if (group === 'galvanized') {
            lines.push(`镀锌端帽 ${dia}`.trim());
          } else if (group === 'steel') {
            lines.push(`法兰盖 ${dia}`.trim());
          } else if (/PE/i.test(seg.material || '')) {
            lines.push(`电熔端帽 ${String(dia).toLowerCase()}`.trim());
          } else {
            // fallback
            lines.push(`封堵 ${dia}`.trim());
          }
        } else {
          lines.push('封堵');
        }
      } else {
        lines.push(c.type);
      }
      // 组件如果未产生任何行文本则无需创建空标注（避免移动模式虚线框/占位）
      if (lines.length > 0) {
        visibleItems.push({ anchor: pos, type: 'component', lines, key: `component:${c.id}` });
      }
    });
    // 配件：类型（插入的三通/弯头使用与自动生成一致的标注规则）
    fittings.forEach(f => {
      const pos = toCanvas({ x: f.x, y: f.y });
      let label = '';
      try {
        if (f && f.type === 'tee') {
          // 找到关联管段（用于材质与直径判定）
          let seg = null;
          if (f.segmentId != null) seg = segments.find(s => s && s.id === f.segmentId) || null;
          // 若未提供，尝试找最近段
          if (!seg && segments && segments.length) {
            let best = null; let bestD = Infinity;
            for (const s of segments) {
              if (!s) continue;
              const d0 = distancePointToSegment(f.x, f.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
              if (d0 < bestD) { bestD = d0; best = s; }
            }
            seg = best;
          }
          const gRaw = seg ? normalizeMaterialGroup(seg.material) : '';
          const typeLabel = gRaw === 'pe' ? '电熔三通' : '三通';
          const mainDia = seg ? (seg.diameter || '') : (f.mainDiameter || f.diameter || '');
          const kind = f.teeKind || f.kind || '等径';
          if (kind === '异径') {
            const branchDia = f.branchDiameter || '';
            const fa = formatDiameterForDisplay(mainDia, { group: (gRaw === 'galvanized' || gRaw === 'steel') ? gRaw : '' });
            const fb = formatDiameterForDisplay(branchDia, { group: (gRaw === 'galvanized' || gRaw === 'steel') ? gRaw : '' });
            const matLabel = gRaw === 'galvanized' ? '镀锌' : (gRaw === 'steel' ? '钢制' : '');
            const base = matLabel ? `${matLabel}${typeLabel}` : typeLabel;
            const pair = fa && fb ? `${fa}/${fb}` : (fa || fb || '');
            label = pair ? `${base} ${pair}` : base;
          } else {
            const fa = formatDiameterForDisplay(mainDia, { group: (gRaw === 'galvanized' || gRaw === 'steel') ? gRaw : '' });
            const matLabel = gRaw === 'galvanized' ? '镀锌' : (gRaw === 'steel' ? '钢制' : '');
            const base = matLabel ? `${matLabel}${typeLabel}` : typeLabel;
            label = fa ? `${base} ${fa}` : base;
          }
        } else if (f && f.type === 'elbow') {
          let seg = null;
          if (f.segmentId != null) seg = segments.find(s => s && s.id === f.segmentId) || null;
          if (!seg && segments && segments.length) {
            let best = null; let bestD = Infinity;
            for (const s of segments) {
              if (!s) continue;
              const d0 = distancePointToSegment(f.x, f.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
              if (d0 < bestD) { bestD = d0; best = s; }
            }
            seg = best;
          }
          const gRaw = seg ? normalizeMaterialGroup(seg.material) : '';
          const typeLabel = gRaw === 'pe' ? '电熔弯头' : '弯头';
          const mainDia = seg ? (seg.diameter || '') : (f.diameter || '');
          const elbowKind = f.elbowKind || '等径';
          const branchDia = (elbowKind === '异径') ? (f.branchDiameter || '') : '';
          const groupForFmt = (gRaw === 'galvanized' || gRaw === 'steel') ? gRaw : '';
          const fa = formatDiameterForDisplay(mainDia, { group: groupForFmt });
          const fb = branchDia ? formatDiameterForDisplay(branchDia, { group: groupForFmt }) : '';
          const matLabel = gRaw === 'galvanized' ? '镀锌' : (gRaw === 'steel' ? '钢制' : '');
          const base = matLabel ? `${matLabel}${typeLabel}` : typeLabel;
          const pair = fb ? `${fa}/${fb}` : fa;
          label = pair ? `${base} ${pair}` : base;
        } else if (f && f.type === 'union') {
          // 活接：按所在管线材质分类为 镀锌活接 / 钢制活接 / 电熔活接
          let seg = null;
          if (f.segmentId != null) seg = segments.find(s => s && s.id === f.segmentId) || null;
          if (!seg && segments && segments.length) {
            let best = null; let bestD = Infinity;
            for (const s of segments) {
              if (!s) continue;
              const d0 = distancePointToSegment(f.x, f.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
              if (d0 < bestD) { bestD = d0; best = s; }
            }
            seg = best;
          }
          const gRaw = seg ? normalizeMaterialGroup(seg.material) : '';
          const diam = seg ? (seg.diameter || '') : (f.diameter || '');
          if (gRaw === 'pe') {
            label = `电熔活接 ${formatDiameterForDisplay(diam, { group: 'pe' })}`.trim();
          } else if (gRaw === 'galvanized' || gRaw === 'steel') {
            const matLabel = gRaw === 'galvanized' ? '镀锌' : '钢制';
            label = `${matLabel}活接 ${formatDiameterForDisplay(diam, { group: gRaw })}`.trim();
          } else {
            label = `活接 ${formatDiameterForDisplay(diam)}`.trim();
          }
        } else {
          // 其它类型仍按原字段显示
          label = f?.type || '';
        }
      } catch (e) {
        label = f?.type || '';
      }
      visibleItems.push({ anchor: pos, type: 'fitting', lines: [label], key: `fitting:${f.id}` });
    });
    // 设计起点：纳入标注集合
    if (designStartPoint && typeof designStartPoint === 'object') {
      const pos = toCanvas({ x: designStartPoint.x, y: designStartPoint.y });
      visibleItems.push({ anchor: pos, type: 'designStart', lines: ['设计起点'], key: `designStart` });
    }

    // 取消缩放感知的标注密度控制，保留全部标注项。
    // 过滤仅根据面板配置的两类：
    // - 镀锌管件 (galvanized) -> connFitting 标签包含“镀锌”
    // - 封堵 (blockage) -> component 的底层类型为 blockage
    // “配件”分类已移除：fitting 以及非镀锌的 connFitting 不参与过滤，始终可见。

    // 连接处管件：根据端点入射段关系生成（弯头/异径/三通/钢塑转换）

    const degDiff = (a, b) => {
      const diff = Math.abs(a - b) % 360;
      return diff > 180 ? 360 - diff : diff;
    };
    const incLabel = (group, type, a, b) => {
      const matLabel = group === 'galvanized' ? '镀锌' : group === 'steel' ? '钢制' : '';
      // format diameters according to group rules
      const fa = a ? formatDiameterForDisplay(a, { group }) : '';
      const fb = b ? formatDiameterForDisplay(b, { group }) : '';
      const pair = fa && fb ? `${fa}/${fb}` : (fa || fb || '');
      const base = matLabel ? `${matLabel}${type}` : type;
      return pair ? `${base} ${pair}` : base;
    };

    const nodeMap = new Map();
    const keyOf = (p) => `${p.x},${p.y}`;
    segments.forEach(seg => {
      const addInc = (ptFrom, ptTo) => {
        const vx = ptTo.x - ptFrom.x;
        const vy = ptTo.y - ptFrom.y;
        let angle = (Math.atan2(vy, vx) * 180) / Math.PI; // [-180,180]
        if (angle < 0) angle += 360; // 规范化到 [0,360)
        const list = nodeMap.get(keyOf(ptFrom)) || [];
        list.push({ material: seg.material, diameter: seg.diameter, angle, world: ptFrom });
        nodeMap.set(keyOf(ptFrom), list);
      };
      addInc(seg.startPoint, seg.endPoint);
      addInc(seg.endPoint, seg.startPoint);
    });

    // 检测“管段中部出支”的虚拟节点以参与三通/转换判定，使标注与统计面板口径一致
    const NODE_EPS = 3; // 世界坐标容差（与侧边面板一致）
    const projectPointToSegment = (px, py, x1, y1, x2, y2) => {
      const dx = x2 - x1; const dy = y2 - y1;
      if (dx === 0 && dy === 0) return { x: x1, y: y1 };
      const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
      const tt = Math.max(0, Math.min(1, t));
      return { x: x1 + tt * dx, y: y1 + tt * dy };
    };
    const nearPoint = (p, q, eps = NODE_EPS) => Math.hypot(p.x - q.x, p.y - q.y) <= eps;
    const pointsEqualLocal = (p1, p2, eps = 0.0001) => Math.abs(p1.x - p2.x) < eps && Math.abs(p1.y - p2.y) < eps;
    const virtualNodeMap = new Map();
    const addVirtualInc = (pt, material, diameter, angle) => {
      const key = `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
      const list = virtualNodeMap.get(key) || [];
      list.push({ material, diameter, angle, world: pt });
      virtualNodeMap.set(key, list);
    };
    for (let i = 0; i < segments.length; i++) {
      const A = segments[i];
      for (let j = 0; j < segments.length; j++) {
        if (i === j) continue;
        const B = segments[j];
        const endpointsB = [B.startPoint, B.endPoint];
        for (const e of endpointsB) {
          const d = distancePointToSegment(e.x, e.y, A.startPoint.x, A.startPoint.y, A.endPoint.x, A.endPoint.y);
          if (d > NODE_EPS) continue;
          const P = projectPointToSegment(e.x, e.y, A.startPoint.x, A.startPoint.y, A.endPoint.x, A.endPoint.y);
          if (nearPoint(P, A.startPoint) || nearPoint(P, A.endPoint)) continue;
          const anglePA = (ptTo) => {
            const vx = ptTo.x - P.x; const vy = ptTo.y - P.y;
            let ang = (Math.atan2(vy, vx) * 180) / Math.PI; if (ang < 0) ang += 360; return ang;
          };
          const angToAStart = anglePA(A.startPoint);
          const angToAEnd = anglePA(A.endPoint);
          const otherB = (pointsEqualLocal(e, B.startPoint) ? B.endPoint : B.startPoint);
          const angToBOther = anglePA(otherB);
          addVirtualInc(P, A.material, A.diameter, angToAStart);
          addVirtualInc(P, A.material, A.diameter, angToAEnd);
          addVirtualInc(P, B.material, B.diameter, angToBOther);
        }
      }
    }

    const processNodeIncs = (incs) => {
      if (!Array.isArray(incs) || incs.length < 2) return;
      const pos = toCanvas(incs[0].world);
      let label = null;

      // 近似同向合并：避免主干被分段导致方向数量>3而漏判三通
      const ANGLE_MERGE_TOL = 3;      // 度，和统计面板保持一致
      const mergeByAngle = (arr, tolDeg) => {
        const sorted = [...arr].sort((a, b) => a.angle - b.angle);
        const out = [];
        for (const item of sorted) {
          if (out.length === 0) { out.push({ ...item }); continue; }
          const prev = out[out.length - 1];
          const isSameDir = degDiff(prev.angle, item.angle) <= tolDeg;
          const sameMat = normalizeMaterialGroup(prev.material) === normalizeMaterialGroup(item.material);
          const prevN = parseDiameterNumeric(prev.diameter);
          const curN = parseDiameterNumeric(item.diameter);
          if (isSameDir && sameMat) {
            // 同向同材质合并：保留直径较大的那条
            out[out.length - 1] = curN >= prevN ? { ...item } : prev;
          } else {
            out.push({ ...item });
          }
        }
        return out;
      };

      const incsMerged = mergeByAngle(incs, ANGLE_MERGE_TOL);

      // 三通：当（合并后）方向数>=3，选取最接近180°的一对为主干。
      // 为与统计面板保持一致，不再强制要求主干严格对向，只要最接近180°即可生成标注。
      if (incsMerged.length >= 3) {
        const angs = incsMerged.map(i => i.angle);
        const pairs = [];
        for (let i = 0; i < incsMerged.length; i++) {
          for (let j = i + 1; j < incsMerged.length; j++) {
            pairs.push({ i, j, d: degDiff(angs[i], angs[j]) });
          }
        }
        pairs.sort((a, b) => Math.abs(180 - a.d) - Math.abs(180 - b.d));
        const main = pairs[0];
        // 选择不在主干对中的任意一个分支（支持≥3方向情况）
        const branchCandidates = incsMerged.map((_, idx) => idx).filter(k => k !== main.i && k !== main.j);
        const branchIdx = branchCandidates.length ? branchCandidates[0] : 0;
        const mainA = incsMerged[main.i];
        const mainB = incsMerged[main.j];
        const branch = incsMerged[branchIdx];
        const gA = normalizeMaterialGroup(mainA.material);
        const gB = normalizeMaterialGroup(mainB.material);
        const gBranch = normalizeMaterialGroup(branch.material);
        const nA = parseDiameterNumeric(mainA.diameter);
        const nB = parseDiameterNumeric(mainB.diameter);
        const mainDia = nA >= nB ? mainA.diameter : mainB.diameter; // 主干取较大
        const branchDia = branch.diameter;
        // 与统计面板一致：材质一致且为 PE → 电熔三通；金属 → 镀锌/钢制三通；其余仍显示三通
        if (gA && gA === gB && gA === gBranch) {
          const group = gA === 'pe' ? '' : gA;
          const type = gA === 'pe' ? '电熔三通' : '三通';
          label = incLabel(group, type, mainDia, branchDia);
        } else if (gA && gA === gB) {
          const group = gA === 'pe' ? '' : gA;
          const type = gA === 'pe' ? '电熔三通' : '三通';
          label = incLabel(group, type, mainDia, branchDia);
        } else {
          const majority = gBranch || gA || gB || '';
          const group = majority === 'pe' ? '' : majority;
          const type = majority === 'pe' ? '电熔三通' : '三通';
          label = incLabel(group, type, mainDia, branchDia);
        }
      } else if (incsMerged.length === 2) {
        // 弯头/直通（两方向）
        const i1 = incsMerged[0];
        const i2 = incsMerged[1];
        const g1 = normalizeMaterialGroup(i1.material);
        const g2 = normalizeMaterialGroup(i2.material);
        const diam1 = i1.diameter;
        const diam2 = i2.diameter;
        const dnum1 = parseDiameterNumeric(diam1);
        const dnum2 = parseDiameterNumeric(diam2);
        const diffDeg = degDiff(i1.angle, i2.angle);
        const STRAIGHT_TOL = 15;
        const isStraightThrough = diffDeg >= (180 - STRAIGHT_TOL);
        const isSteelGroup = (g) => g === 'galvanized' || g === 'steel';
        if ((isSteelGroup(g1) && g2 === 'pe') || (isSteelGroup(g2) && g1 === 'pe')) {
          // 仅当一侧为钢（镀锌/无缝/直缝）且另一侧为 PE 时视为“钢塑转换”
          label = incLabel('', '钢塑转换', diam1, diam2);
        } else if (g1 !== g2) {
          // 其它异材（例如 镀锌 vs 无缝钢）不视为钢塑转换，跳过标注
          label = null;
        } else {
          const group = (g1 === 'galvanized' || g1 === 'steel') ? g1 : (g1 === 'pe' ? 'pe' : '');
          if (dnum1 !== dnum2) {
            const large = dnum1 >= dnum2 ? diam1 : diam2;
            const small = dnum1 >= dnum2 ? diam2 : diam1;
            if (isStraightThrough) {
              label = group === 'pe'
                ? incLabel('', '电熔异径管', large, small)
                : incLabel(group, '异径管', large, small);
            } else {
              label = group === 'pe'
                ? incLabel('', '电熔弯头', large, null)
                : incLabel(group, '弯头', large, null);
            }
          } else {
            if (isStraightThrough) {
              label = null;
            } else {
              label = group === 'pe'
                ? incLabel('', '电熔弯头', diam1, null)
                : incLabel(group, '弯头', diam1, null);
            }
          }
        }
      }

      if (label) {
        // 为连接管件标注生成稳定唯一的 key（使用世界坐标点）
        const world = incs[0]?.world || { x: 0, y: 0 };
        const key = `connFitting:${world.x},${world.y}`;
        visibleItems.push({ anchor: pos, type: 'connFitting', lines: [label], key });
      }
    };

    // 处理端点节点
    nodeMap.forEach(processNodeIncs);
    // 处理虚拟节点（管段中部出支）
    virtualNodeMap.forEach(processNodeIncs);

    // 为所有标注添加可见性标记，但不过滤掉隐藏的标注
    // 这样可以确保所有标注都参与布局计算，保持位置稳定
    const vis = labelVisibility || { galvanized: true, blockage: true, junction: true, union: true, designStart: true };
    // Support multiple categories per label (e.g. 镀锌活接 should respond to both
    // `galvanized` and `union` checkboxes). Attach `cats` array to each item
    // and compute visibility as OR over the enabled categories.
    visibleItems.forEach(item => {
      const cats = [];
      if (item.type === 'connFitting' || item.type === 'fitting') {
        if (Array.isArray(item.lines)) {
          const text = item.lines.join(' ');
          if (String(text).includes('活接')) {
            cats.push('union');
          }
          if (String(text).includes('镀锌')) {
            cats.push('galvanized');
          }
        }
      } else if (item.type === 'component') {
        if (item.key && item.key.startsWith('component:')) {
          const id = item.key.split(':')[1];
          const comp = components.find(c => String(c.id) === String(id));
          if (comp && comp.type === 'blockage') cats.push('blockage');
          else if (comp && comp.type === 'junction') cats.push('junction');
        }
      } else if (item.type === 'designStart') {
        cats.push('designStart');
      }
      item.cats = cats;
      // If no category assigned, keep visible; otherwise require ALL categories to be enabled
      // (so e.g. a 镀锌活接 will be visible only when both 'galvanized' AND 'union' are true)
      item.isVisible = (cats.length === 0) || cats.every(c => !!vis[c]);
    });

    // 保留所有标注用于布局计算，确保位置稳定
    if (visibleItems.length === 0) return;

    // 计算管线包围盒
    const xs = [];
    const ys = [];
    segments.forEach(s => {
      const a = toCanvas(s.startPoint); const b = toCanvas(s.endPoint);
      xs.push(a.x, b.x); ys.push(a.y, b.y);
    });
    components.forEach(c => { const p = toCanvas({ x: c.x, y: c.y }); xs.push(p.x); ys.push(p.y); });
    fittings.forEach(f => { const p = toCanvas({ x: f.x, y: f.y }); xs.push(p.x); ys.push(p.y); });
    const bbox = {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys)
    };

    // 标注布局（动态缩放）：就近排列在包围盒左右空白带，网格槽位搜索 + 回退
    const BASE_FONT = 12;
    const fontPx = Math.round(BASE_FONT * scale);
    const unit = fontPx / BASE_FONT; // 用字体比例驱动其它长度，保持视觉比例
    const margin = 40 * unit;
    const HORIZ_LEN = 120 * unit;
    // 为了尽量缩短水平段：为每条引线提供动态水平段长度的上下限
    const HORIZ_LEN_MIN = 60 * unit;
    const HORIZ_LEN_MAX = 100 * unit;
    const ELBOW_LEN = 24 * unit;
    const ARROW_SIZE = 6 * unit;
    const TEXT_GAP = 6 * unit;
    const lineHeight = 28 * unit;
    const vGap = 18 * unit;
    const midX = (bbox.minX + bbox.maxX) / 2;
    const bandLeftTextX = bbox.minX - margin - HORIZ_LEN - TEXT_GAP;
    const bandRightTextX = bbox.maxX + margin + HORIZ_LEN + TEXT_GAP;

    // 构造管线段集合用于交叉检测（画布坐标，含 id）
    const pipeSegs = segments.map(s => {
      const a = toCanvas(s.startPoint); const b = toCanvas(s.endPoint);
      return { a, b, id: s.id };
    });

    const segIntersect = (p1, p2, p3, p4) => {
      const ccw = (A, B, C) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
      return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    };
    // 样式：黑色文本与线条（字体随缩放）
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.lineWidth = 1;
    if (ctx.setLineDash) ctx.setLineDash([]);
    ctx.font = `${fontPx}px PingFang SC`;
    ctx.textBaseline = 'bottom';
    // 构建网格槽位（左右带同样的垂直槽位）
    const slotHeight = lineHeight + vGap;
    const makeSlots = (minY, maxY) => {
      const slots = [];
      let y = minY;
      while (y <= maxY) { slots.push(y); y += slotHeight; }
      return slots;
    };
    const slotsLeft = makeSlots(bbox.minY - margin, bbox.maxY + margin);
    const slotsRight = makeSlots(bbox.minY - margin, bbox.maxY + margin);
    const occLeft = new Array(slotsLeft.length).fill(false);
    const occRight = new Array(slotsRight.length).fill(false);

    // 已绘制引线与文本框用于避让
    const leadersDrawn = [];
    const labelBoxesLeft = [];
    const labelBoxesRight = [];
    const arrowTips = [];

    // 自动决定标注文本应绘制在左侧还是右侧（手动设置优先生效）
    const determineSideForItem = (item) => {
      // 手动优先：若存在 leaderManual 的 elbow/end 则根据其相对位置确定侧别
      try {
        const off = labelOffsetsRef.current?.[item.key];
        const man = off && off.leaderManual ? off.leaderManual : null;
        if (man && man.elbowWorld && man.endWorld) {
          return man.endWorld.x >= man.elbowWorld.x ? 'right' : 'left';
        }
      } catch {}

      // 远离中线的直接按位置决定；靠近中线则综合角度与距离评估
      const MARGIN_X = 24 * unit;
      const mid = midX;
      if (item.anchor.x < mid - MARGIN_X) return 'left';
      if (item.anchor.x > mid + MARGIN_X) return 'right';

      // 角度适配：选择与管段方向形成更佳（不太平行）的 ±45° 斜线侧
      const getNearestPipeAngle = (pt) => {
        let minD = Infinity; let ang = 0;
        for (const ps of pipeSegs) {
          const x1 = ps.a.x, y1 = ps.a.y, x2 = ps.b.x, y2 = ps.b.y;
          const A = pt.x - x1, B = pt.y - y1, C = x2 - x1, D = y2 - y1;
          const dot = A * C + B * D; const lenSq = C * C + D * D;
          let param = -1; if (lenSq !== 0) param = dot / lenSq;
          let xx, yy;
          if (param < 0) { xx = x1; yy = y1; }
          else if (param > 1) { xx = x2; yy = y2; }
          else { xx = x1 + param * C; yy = y1 + param * D; }
          const dx = pt.x - xx, dy = pt.y - yy; const d = Math.hypot(dx, dy);
          if (d < minD) { minD = d; ang = Math.atan2(y2 - y1, x2 - x1); }
        }
        return ang;
      };
      const normalize = (ang) => { let t = ang % (2 * Math.PI); if (t < 0) t += 2 * Math.PI; return t; };
      const absDiff = (a1, a2) => { let d = Math.abs(normalize(a1) - normalize(a2)); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
      const MIN_DIFF = 18 * Math.PI / 180;
      const pipeAng = getNearestPipeAngle(item.anchor);
      const leftPhis = [Math.PI - Math.PI / 4, Math.PI + Math.PI / 4];
      const rightPhis = [Math.PI / 4, -Math.PI / 4];
      const bestLeft = Math.max(...leftPhis.map(p => absDiff(p, pipeAng)));
      const bestRight = Math.max(...rightPhis.map(p => absDiff(p, pipeAng)));
      const leftPenalty = bestLeft < MIN_DIFF ? (MIN_DIFF - bestLeft) : 0;
      const rightPenalty = bestRight < MIN_DIFF ? (MIN_DIFF - bestRight) : 0;

      // 距离倾向：更靠近哪侧的标注带（以末端文本X为近似）
      const distLeft = Math.abs(item.anchor.x - bandLeftTextX);
      const distRight = Math.abs(item.anchor.x - bandRightTextX);
      const wAngle = 10.0; const wDist = 0.002; // 权重
      const scoreLeft = leftPenalty * wAngle + distLeft * wDist;
      const scoreRight = rightPenalty * wAngle + distRight * wDist;
      return scoreLeft <= scoreRight ? 'left' : 'right';
    };

    const segLen = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
    const rectEdges = (rect) => [
      { a: { x: rect.x1, y: rect.y1 }, b: { x: rect.x2, y: rect.y1 } },
      { a: { x: rect.x2, y: rect.y1 }, b: { x: rect.x2, y: rect.y2 } },
      { a: { x: rect.x2, y: rect.y2 }, b: { x: rect.x1, y: rect.y2 } },
      { a: { x: rect.x1, y: rect.y2 }, b: { x: rect.x1, y: rect.y1 } },
    ];
    const countIntersectionsExtended = (path, side) => {
      let c = 0;
      for (const seg of path) {
        for (const ps of pipeSegs) if (segIntersect(seg.a, seg.b, ps.a, ps.b)) c++;
        for (const ld of leadersDrawn) if (segIntersect(seg.a, seg.b, ld.a, ld.b)) c++;
        const boxes = side === 'left' ? labelBoxesLeft : labelBoxesRight;
        for (const rect of boxes) {
          for (const e of rectEdges(rect)) if (segIntersect(seg.a, seg.b, e.a, e.b)) c++;
        }
      }
      // 箭头尖端邻近处罚：估算最后一段与管段交点，避免尖端重叠
      try {
        const last = path[path.length - 1];
        const phi = Math.atan2(last.b.y - last.a.y, last.b.x - last.a.x);
        const dir = { x: Math.cos(phi), y: Math.sin(phi) };
        const p0 = { x: last.a.x, y: last.a.y };
        const cross = (v, w) => v.x * w.y - v.y * w.x;
        let tip = null; let bestDist = Infinity;
        for (const ps of pipeSegs) {
          const w = { x: ps.b.x - ps.a.x, y: ps.b.y - ps.a.y };
          const denom = cross(dir, w);
          if (Math.abs(denom) < 1e-6) continue;
          const ap = { x: ps.a.x - p0.x, y: ps.a.y - p0.y };
          const t = cross(ap, w) / denom;
          const u = cross(ap, dir) / denom;
          if (t >= 0 && u >= 0 && u <= 1) {
            const pt = { x: p0.x + dir.x * t, y: p0.y + dir.y * t };
            const d = Math.hypot(pt.x - last.b.x, pt.y - last.b.y);
            if (d < bestDist) { bestDist = d; tip = pt; }
          }
        }
        if (tip) {
          const TIP_GAP = 10 * unit;
          for (const at of arrowTips) {
            if (Math.hypot(tip.x - at.x, tip.y - at.y) < TIP_GAP) c += 3;
          }
        }
      } catch {}
      return c;
    };

  // 新版路径：文本侧开始，先水平到端点，再斜线到锚点（两段）
  // 斜线段角度应与所在管道段的角度成 ±45°，优先选择与文本所在侧一致的方向
  const buildPath = (side, textX, textY, textWidth, anchor) => {
      // 确保左侧文本始终在水平线段右端点的右侧，右侧文本始终在水平线段左端点的左侧
      const start = side === 'left'
        ? { x: textX + textWidth + TEXT_GAP, y: textY }
        : { x: textX - textWidth - TEXT_GAP, y: textY }; // 右侧：文本左边缘 - 间距

      // 优化动态水平段长度：基于垂直距离和水平距离的综合考虑
      const diffXAbs = Math.abs(anchor.x - start.x);
      const diffYAbs = Math.abs(anchor.y - start.y);
      
      // 根据垂直距离调整水平段长度：垂直距离越小，水平段越短
      const verticalFactor = Math.max(0.15, Math.min(1.0, diffYAbs / (lineHeight * 2.5))); // 进一步降低垂直距离因子
      const baseDynamicLen = diffXAbs * 0.25; // 基础动态长度进一步降低到25%
      const adjustedLen = baseDynamicLen * verticalFactor; // 根据垂直距离调整
      
      // 针对异径管标注进一步缩短引线长度
      const isReducerFitting = anchor.type === 'connFitting' && 
        (anchor.lines && anchor.lines.some(line => line.includes('异径管')));
      const reducerFactor = isReducerFitting ? 0.6 : 1.0; // 异径管引线长度减少40%
      
      // 最终长度限制在更小的范围内，确保引线更紧凑
      let finalLen = Math.max(HORIZ_LEN_MIN * 0.5, Math.min(HORIZ_LEN_MAX * 0.6, adjustedLen)) * reducerFactor;
      
      // 对于异径管，确保引线有足够的倾斜角度（45度以上）
      if (isReducerFitting) {
        const minAngle = Math.PI / 4; // 45度
        const currentAngle = Math.atan2(diffYAbs, finalLen);
        if (currentAngle < minAngle) {
          // 调整水平长度以达到最小角度
          finalLen = diffYAbs / Math.tan(minAngle);
          finalLen = Math.max(HORIZ_LEN_MIN * 0.3, Math.min(finalLen, HORIZ_LEN_MAX * 0.5));
        }
      }

      // Try to compute a horizEnd such that the slanted segment (horizEnd -> anchor)
      // has angle = pipeAngle ± 45deg. Find nearest pipe segment angle at anchor.
      const getNearestPipeAngle = (pt) => {
        let minD = Infinity;
        let ang = 0;
        for (const ps of pipeSegs) {
          // distance from point to segment
          const x1 = ps.a.x, y1 = ps.a.y, x2 = ps.b.x, y2 = ps.b.y;
          const A = pt.x - x1, B = pt.y - y1, C = x2 - x1, D = y2 - y1;
          const dot = A * C + B * D;
          const lenSq = C * C + D * D;
          let param = -1;
          if (lenSq !== 0) param = dot / lenSq;
          let xx, yy;
          if (param < 0) { xx = x1; yy = y1; }
          else if (param > 1) { xx = x2; yy = y2; }
          else { xx = x1 + param * C; yy = y1 + param * D; }
          const dx = pt.x - xx, dy = pt.y - yy;
          const d = Math.hypot(dx, dy);
          if (d < minD) {
            minD = d;
            ang = Math.atan2(y2 - y1, x2 - x1);
          }
        }
        return ang;
      };

      let horizEnd = null;
      try {
        const pipeAng = getNearestPipeAngle(anchor);
        const candPhis = [pipeAng + Math.PI / 4, pipeAng - Math.PI / 4];
        // choose candidate that places horizEnd on the correct side (right for left-side items, left for right-side items)
        let chosen = null;
        for (const phi of candPhis) {
          // 避免近似水平的情况
          const tanPhi = Math.tan(phi);
          if (Math.abs(tanPhi) < 1e-4) continue;
          const hx = anchor.x - (anchor.y - start.y) / tanPhi; // 使 (horizEnd -> anchor) 斜段角度为 pipeAng ±45°
          // 不再强制侧向约束，交由后续 clamp 控制，确保始终存在45°斜线
          chosen = { hx, phi };
          break;
        }

        if (chosen) {
          // clamp horizontal length
          const hx = chosen.hx;
          const clampedHx = side === 'left'
            ? Math.min(hx, start.x + HORIZ_LEN_MAX)
            : Math.max(hx, start.x - HORIZ_LEN_MAX);
          const finalHx = clampedHx;
          horizEnd = { x: finalHx, y: start.y };
        }
      } catch {
        horizEnd = null;
      }

      // fallback: previous horizontal-first approach
      if (!horizEnd) {
        horizEnd = side === 'left'
          ? { x: start.x + finalLen, y: start.y }
          : { x: start.x - finalLen, y: start.y };
      }

      return [
        { a: start, b: horizEnd },
        { a: horizEnd, b: anchor },
      ];
    };

    // 正交（曼哈顿）引线绘制：支持多段，最后一段方向用于箭头朝向
    // 更新：箭头尖端吸附到目标元素边界/顶点，避免侵入元素内部
    const drawSegmentsOrth = (segs, item) => {
      const last = segs[segs.length - 1];
      const anchor = item.anchor;
      const dx = anchor.x - last.a.x;
      const dy = anchor.y - last.a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      // 计算吸附后的尖端（顶点/边界）
      // allow manual override from labelOffsets (leaderManual in world coords) by caller
      const manual = (labelOffsetsRef.current && labelOffsetsRef.current[item.key] && labelOffsetsRef.current[item.key].leaderManual)
        ? labelOffsetsRef.current[item.key].leaderManual
        : null;

      const snapTip = (() => {
        // if manual tip provided (world coords), use it
        if (manual && manual.tipWorld) {
          return toCanvas(manual.tipWorld);
        }
        if (item.type === 'segment') {
          // 仅吸附到该标注所指管段（segmentId），禁止切换到其他管段
          const phi = Math.atan2(anchor.y - last.a.y, anchor.x - last.a.x);
          const dir = { x: Math.cos(phi), y: Math.sin(phi) };
          const p0 = { x: last.a.x, y: last.a.y };
          const cross = (v, w) => v.x * w.y - v.y * w.x;
          let best = null;
          const target = pipeSegs.find(ps => ps.id === item.segmentId);
          if (target) {
            const w = { x: target.b.x - target.a.x, y: target.b.y - target.a.y };
            const denom = cross(dir, w);
            if (Math.abs(denom) >= 1e-6) {
              const ap = { x: target.a.x - p0.x, y: target.a.y - p0.y };
              const t = cross(ap, w) / denom;
              const u = cross(ap, dir) / denom;
              if (t >= 0 && u >= 0 && u <= 1) {
                best = { x: p0.x + dir.x * t, y: p0.y + dir.y * t };
              }
            }
            // 若斜线未与目标管段相交，则回退为锚点到该管段的最近投影点
            if (!best) {
              const vx = w.x; const vy = w.y;
              const lenSq = vx * vx + vy * vy || 1;
              let uProj = ((anchor.x - target.a.x) * vx + (anchor.y - target.a.y) * vy) / lenSq;
              uProj = Math.max(0, Math.min(1, uProj));
              best = { x: target.a.x + uProj * vx, y: target.a.y + uProj * vy };
            }
          }
          return best || anchor;
        }
        // 组件优先顶点吸附；配件/起点按半径退回
        if (item.type === 'component') {
          // 近似为沿管段方向旋转的矩形：优先选择朝向来线方向的顶点
          const pipeAng = getNearestPipeAngle(anchor);
          const cosA = Math.cos(pipeAng); const sinA = Math.sin(pipeAng);
          const w = 30 * unit; // 近似宽度（meter/regulator 常用值）
          const h = 20 * unit; // 近似高度
          const hx = (w / 2), hy = (h / 2);
          const vx = { x: cosA * hx, y: sinA * hx };
          const vy = { x: -sinA * hy, y: cosA * hy };
          const verts = [
            { x: anchor.x + vx.x + vy.x, y: anchor.y + vx.y + vy.y },
            { x: anchor.x + vx.x - vy.x, y: anchor.y + vx.y - vy.y },
            { x: anchor.x - vx.x + vy.x, y: anchor.y - vx.y + vy.y },
            { x: anchor.x - vx.x - vy.x, y: anchor.y - vx.y - vy.y },
          ];
          const dir = { x: last.a.x - anchor.x, y: last.a.y - anchor.y };
          const dirLen = Math.hypot(dir.x, dir.y) || 1;
          const uxIn = dir.x / dirLen; const uyIn = dir.y / dirLen;
          let best = verts[0]; let bestDot = -Infinity;
          for (const v of verts) {
            const vxr = v.x - anchor.x; const vyr = v.y - anchor.y;
            const dot = vxr * uxIn + vyr * uyIn;
            if (dot > bestDot) { bestDot = dot; best = v; }
          }
          return best;
        }
        // 连接处管件（弯头/三通/异径等）：保持斜段45°，以斜线与最近管段的交点为尖端
        if (item.type === 'connFitting') {
          const phi = Math.atan2(anchor.y - last.a.y, anchor.x - last.a.x);
          const dir = { x: Math.cos(phi), y: Math.sin(phi) };
          const p0 = { x: last.a.x, y: last.a.y };
          const cross = (v, w) => v.x * w.y - v.y * w.x;
          let best = null; let bestDist = Infinity;
          for (const ps of pipeSegs) {
            const w = { x: ps.b.x - ps.a.x, y: ps.b.y - ps.a.y };
            const denom = cross(dir, w);
            if (Math.abs(denom) < 1e-6) continue;
            const ap = { x: ps.a.x - p0.x, y: ps.a.y - p0.y };
            const t = cross(ap, w) / denom;
            const u = cross(ap, dir) / denom;
            if (t >= 0 && u >= 0 && u <= 1) {
              const pt = { x: p0.x + dir.x * t, y: p0.y + dir.y * t };
              const d = Math.hypot(pt.x - anchor.x, pt.y - anchor.y);
              if (d < bestDist) { bestDist = d; best = pt; }
            }
          }
          return best || anchor;
        }
        // 配件/起点：沿引线方向从中心退回至边界（按实际绘制半径）
        const r =
          item.type === 'fitting' ? 5 :
          item.type === 'designStart' ? 6 * unit :
          8 * unit;
        return { x: anchor.x - ux * r, y: anchor.y - uy * r };
      })();

      // 绘制路径，最后一段终点替换为 snapTip
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(segs[0].a.x, segs[0].a.y);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const end = (i === segs.length - 1) ? snapTip : s.b;
        ctx.lineTo(end.x, end.y);
        leadersDrawn.push({ a: { x: s.a.x, y: s.a.y }, b: { x: end.x, y: end.y } });
      }
      ctx.stroke();
      // 箭头：与最后一段方向一致，尖端对齐吸附点
      const ang = Math.atan2(snapTip.y - last.a.y, snapTip.x - last.a.x);
      const tip = { x: snapTip.x, y: snapTip.y };
      const base = { x: tip.x - Math.cos(ang) * ARROW_SIZE, y: tip.y - Math.sin(ang) * ARROW_SIZE };
      const nx = Math.cos(ang + Math.PI / 2);
      const ny = Math.sin(ang + Math.PI / 2);
      const p1 = { x: base.x + nx * (ARROW_SIZE * 0.5), y: base.y + ny * (ARROW_SIZE * 0.5) };
      const p2 = { x: base.x - nx * (ARROW_SIZE * 0.5), y: base.y - ny * (ARROW_SIZE * 0.5) };
      // decide arrow fill color: if in move mode and tip is draggable, render purple
      let tipDraggableBefore = true;
      try {
        for (const ps of pipeSegs) {
          const eps = 1e-3;
          if ((Math.abs(tip.x - ps.a.x) < eps && Math.abs(tip.y - ps.a.y) < eps) || (Math.abs(tip.x - ps.b.x) < eps && Math.abs(tip.y - ps.b.y) < eps)) {
            tipDraggableBefore = false; break;
          }
        }
      } catch {}
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      // 需求1&2：设计起点、弯头、三通与接驳点（指向固定点）禁止拖拽箭头
      try {
        const isDesignStart = item && item.type === 'designStart';
        // 连接管件的中文标注通常在 item.type === 'connFitting'，需要检查文案是否包含“弯头/三通”
        const isConnElbowOrTee = item && item.type === 'connFitting' && Array.isArray(item.lines) && item.lines.some(l => /弯头|三通|elbow|tee/i.test(String(l || '')));
        // 兼容以前的英文匹配（如果 item.type === 'fitting' 且包含 elbow/tee）
        const isElbowOrTeeFitting = item && item.type === 'fitting' && Array.isArray(item.lines) && item.lines.some(l => /弯头|三通|elbow|tee/i.test(String(l || '')));
        let isJunctionComponent = false;
        if (!isJunctionComponent && item && item.type === 'component' && item.key && item.key.startsWith('component:')) {
          const id = String(item.key).split(':')[1];
          const comp = components.find(c => String(c.id) === String(id));
          if (comp && comp.type === 'junction') isJunctionComponent = true;
        }
        if (isDesignStart || isConnElbowOrTee || isElbowOrTeeFitting || isJunctionComponent) tipDraggableBefore = false;
      } catch {}
      if (uiMode === 'move' && tipDraggableBefore && !exportingRef.current) {
        ctx.fillStyle = '#7c3aed';
      } else {
        ctx.fillStyle = '#000000';
      }
      ctx.fill();
      // 记录已使用箭头尖端，供后续避让使用
      arrowTips.push(tip);
      // 记录本次引线的把手位置（画布坐标）并计算可拖拽性
      try {
        const elbowPt = (segs && segs.length && segs[0] && segs[0].b) ? segs[0].b : null;
        const tipPt = tip;
        const anchorPt = anchor;
        // tip draggable unless it snaps to a pipe endpoint
        let tipDraggable = tipDraggableBefore;
        // 终点（end）定义为水平段的另一端（segs[0].a），不是箭头背后的点。
        // segs[0] 是水平段：{ a: xStart, b: xEnd(horizEnd) }
        let endPt = null;
        try {
          endPt = (segs && segs.length && segs[0] && segs[0].a) ? { x: segs[0].a.x, y: segs[0].a.y } : null;
        } catch (e) { endPt = null; }
        const entry = {
          key: item.key,
          segmentId: item.segmentId || null,
          tip: tipPt ? { x: tipPt.x, y: tipPt.y } : null,
          // end: the far end of the horizontal segment (towards the text)
          end: endPt,
          elbow: elbowPt ? { x: elbowPt.x, y: elbowPt.y } : null,
          anchor: anchorPt ? { x: anchorPt.x, y: anchorPt.y } : null,
          // end 把手始终可拖拽（允许调整水平线长度/位置）；elbow 不在此处限制，改由事件层阻止拖拽
          draggable: { tip: !!tipDraggable, end: true, elbow: true, anchor: true }
        };
        leaderHandlesRef.current.push(entry);
        // 需求3：在斜线与水平线交点（elbow）绘制紫色圆点，点击用于切换水平线方向（仅移动模式显示）
        if (elbowPt && uiMode === 'move' && !exportingRef.current) {
          ctx.save();
          if (ctx.setLineDash) ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(elbowPt.x, elbowPt.y, Math.max(4, 3 * (scale || 1)), 0, Math.PI * 2);
          ctx.fillStyle = '#7c3aed';
          ctx.fill();
          ctx.restore();
        }
      } catch (e) {
        /* ignore */
      }
    };

    const placeItemsOnSide = (itemsSide, side, attempt = 0) => {
      const slots = side === 'left' ? slotsLeft : slotsRight;
      const occ = side === 'left' ? occLeft : occRight;
      const labelBoxes = side === 'left' ? labelBoxesLeft : labelBoxesRight;

      // 先按锚点Y排序并分配垂直槽位（用于分散），绘制时根据45°关系微调Y
      itemsSide.sort((a, b) => a.anchor.y - b.anchor.y);

      const allocs = [];
      for (const item of itemsSide) {
        const labelText = item.lines.join(' ');
        ctx.textAlign = 'left';
        const textWidth = ctx.measureText(labelText).width;

        const preferredIdx = Math.max(0, Math.min(slots.length - 1, Math.round((item.anchor.y - (bbox.minY - margin)) / slotHeight)));
        let chosenIdx = -1;
        for (let k = 0; k < slots.length; k++) {
          const up = preferredIdx - k;
          if (up >= 0 && up < slots.length && !occ[up]) { chosenIdx = up; break; }
          const down = preferredIdx + k;
          if (down >= 0 && down < slots.length && !occ[down]) { chosenIdx = down; break; }
        }
        if (chosenIdx === -1) {
          if (attempt === 0) {
            const otherSide = side === 'left' ? 'right' : 'left';
            placeItemsOnSide([item], otherSide, 1);
          }
          continue;
        }
        occ[chosenIdx] = true;
        const slotCenterY = slots[chosenIdx] + lineHeight / 2;
        allocs.push({ item, labelText, textWidth, slotCenterY });
      }

      // 通道列：固定水平线末端X，文本末端对齐此X；避免交叉
      const CHANNEL_SPACING = 24 * unit;
      const MIN_SEP = 4 * unit;
      const MAX_CHANNELS = 6;
      const gutterX = side === 'left' ? (bbox.minX - margin + ELBOW_LEN) : (bbox.maxX + margin - ELBOW_LEN);
      const channelsX = Array.from({ length: MAX_CHANNELS }, (_, i) =>
        side === 'left' ? (gutterX + i * CHANNEL_SPACING) : (gutterX - i * CHANNEL_SPACING)
      );
      const lastIntervals = new Array(MAX_CHANNELS).fill(null);

      allocs.sort((a, b) => a.item.anchor.y - b.item.anchor.y);

      // 最近管段角度：用于确定45°斜线角
      const getNearestPipeAngle = (pt) => {
        let minD = Infinity;
        let ang = 0;
        for (const ps of pipeSegs) {
          const x1 = ps.a.x, y1 = ps.a.y, x2 = ps.b.x, y2 = ps.b.y;
          const A = pt.x - x1, B = pt.y - y1, C = x2 - x1, D = y2 - y1;
          const dot = A * C + B * D;
          const lenSq = C * C + D * D;
          let param = -1;
          if (lenSq !== 0) param = dot / lenSq;
          let xx, yy;
          if (param < 0) { xx = x1; yy = y1; }
          else if (param > 1) { xx = x2; yy = y2; }
          else { xx = x1 + param * C; yy = y1 + param * D; }
          const dx = pt.x - xx, dy = pt.y - yy;
          const d = Math.hypot(dx, dy);
          if (d < minD) { minD = d; ang = Math.atan2(y2 - y1, x2 - x1); }
        }
        return ang;
      };
      // 指定管段角度：根据 segmentId 获取该段的方向
      const getPipeAngleById = (segmentId) => {
        const s = segments.find(ss => ss.id === segmentId);
        if (!s) return 0;
        const a = toCanvas(s.startPoint);
        const b = toCanvas(s.endPoint);
        return Math.atan2(b.y - a.y, b.x - a.x);
      };

      for (const a of allocs) {
        // 应用标签偏移（拖拽后）：偏移以“世界坐标”存储，绘制时转换为像素
        const offRaw = labelOffsetsRef.current?.[a.item.key];
        const effForOffset = scale * BASE_VISUAL_SCALE;
        const tx = offRaw ? ((offRaw.dxWorld ?? offRaw.dx ?? 0) * effForOffset) : 0;
        const ty = offRaw ? ((offRaw.dyWorld ?? offRaw.dy ?? 0) * effForOffset) : 0;
        const isDragged = !!offRaw && (((offRaw.dxWorld ?? offRaw.dx ?? 0) !== 0) || ((offRaw.dyWorld ?? offRaw.dy ?? 0) !== 0));
        // 锚点：仅“指向管段”的标注随拖拽移动锚点，其它类型锚点保持不变
        const anchorBase = a.item.anchor;
        const anchor = (a.item.type === 'segment') ? { x: anchorBase.x + tx, y: anchorBase.y + ty } : anchorBase;
        const ay = anchor.y;
        const intervalBase = { y1: Math.min(a.slotCenterY, ay), y2: Math.max(a.slotCenterY, ay) };
        let chIdx = 0; let found = false;
        for (; chIdx < MAX_CHANNELS; chIdx++) {
          const prev = lastIntervals[chIdx];
          if (!prev || prev.y2 + MIN_SEP <= intervalBase.y1 || intervalBase.y2 + MIN_SEP <= prev.y1) { lastIntervals[chIdx] = intervalBase; found = true; break; }
        }
        if (!found) chIdx = Math.min(MAX_CHANNELS - 1, chIdx);
        // 保证xEnd与锚点X至少有最小水平差，以避免斜段退化为水平
        let xEnd = channelsX[chIdx];
        const MIN_DX = 6 * unit;
        if (Math.abs(anchor.x - xEnd) < MIN_DX) {
          const nextIdx = (chIdx + 1 < channelsX.length) ? chIdx + 1 : (chIdx - 1 >= 0 ? chIdx - 1 : chIdx);
          const candidate = channelsX[nextIdx];
          if (Math.abs(anchor.x - candidate) >= MIN_DX) {
            xEnd = candidate;
          } else {
            xEnd += (side === 'left' ? MIN_DX : -MIN_DX);
          }
        }

        // 斜线角：固定±45°（按侧别选向），并避免与目标管段夹角过小
        const pipeAng = (a.item.type === 'segment' && a.item.segmentId)
          ? getPipeAngleById(a.item.segmentId)
          : getNearestPipeAngle(anchor);
        const normalize = (ang) => { let t = ang % (2 * Math.PI); if (t < 0) t += 2 * Math.PI; return t; };
        const absDiff = (a1, a2) => { let d = Math.abs(normalize(a1) - normalize(a2)); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
        const MIN_DIFF = 18 * Math.PI / 180;
        const TAN_MAX = 4.0;
        const basePhis = side === 'left'
          ? [Math.PI - Math.PI / 4, Math.PI + Math.PI / 4]
          : [Math.PI / 4, -Math.PI / 4];
        let cand = basePhis
          .map(p => ({ p, diff: absDiff(p, pipeAng), tanAbs: Math.abs(Math.tan(p)) }))
          .filter(c => c.tanAbs < TAN_MAX);
        let chosen = cand.find(c => c.diff >= MIN_DIFF);
        if (!chosen && cand.length) chosen = cand.reduce((a, b) => (a.diff >= b.diff ? a : b));
        const phi = chosen ? chosen.p : basePhis[0];

        // 水平线Y：保证斜线为phi，且文本在水平线正上方
        const lineY = anchor.y - (anchor.x - xEnd) * Math.tan(phi);
        const textY = lineY - TEXT_GAP;

        // 文本末端与水平线末端对齐：左侧对齐右端；右侧对齐左端
        let textX;
        if (side === 'left') { textX = xEnd; ctx.textAlign = 'right'; }
        else { textX = xEnd; ctx.textAlign = 'left'; }

        // 水平段长度（从文本下方到末端），至少覆盖完整文本宽度
        const dynLen = Math.max(HORIZ_LEN_MIN * 0.5, Math.min(HORIZ_LEN_MAX, 24 * unit + Math.abs(anchor.y - lineY) * 0.15));
        const horizLen = Math.max(a.textWidth, dynLen);
        const xStart = side === 'left' ? (xEnd - horizLen) : (xEnd + horizLen);

        // 两段路径：水平段 + 45°斜段
        let segs = [
          { a: { x: xStart, y: lineY }, b: { x: xEnd, y: lineY } },
          { a: { x: xEnd, y: lineY }, b: { x: anchor.x, y: anchor.y } },
        ];

        // 初始文本框（用于与已绘制文本避让）
        const initFinalTextY = lineY - TEXT_GAP;
        const initBox = (side === 'left')
          ? { x1: xEnd - a.textWidth, y1: initFinalTextY - lineHeight, x2: xEnd, y2: initFinalTextY }
          : { x1: xEnd, y1: initFinalTextY - lineHeight, x2: xEnd + a.textWidth, y2: initFinalTextY };
        const boxesRef = side === 'left' ? labelBoxesLeft : labelBoxesRight;
        const boxesOverlap = (r1, r2) => !(r1.x2 <= r2.x1 || r1.x1 >= r2.x2 || r1.y2 <= r2.y1 || r1.y1 >= r2.y2);
        const initOverlap = boxesRef.some(b => boxesOverlap(initBox, b)) ? 1000 : 0;

        // 碰撞评分并作轻微上下偏移尝试（同时避免文本框重叠）；拖拽时禁用“避让”
        let bestPath = segs; let bestScore = countIntersectionsExtended(segs, side) + initOverlap;
        if (!isDragged && bestScore > 0) {
          const STEP = slotHeight / 3;
          const candidatesY = [lineY - STEP, lineY + STEP, lineY - 2 * STEP, lineY + 2 * STEP];
          for (const yy of candidatesY) {
            const p = [
              { a: { x: xStart, y: yy }, b: { x: xEnd, y: yy } },
              { a: { x: xEnd, y: yy }, b: { x: anchor.x, y: anchor.y } },
            ];
            const sc = countIntersectionsExtended(p, side);
            const finalY = yy - TEXT_GAP;
            const box = (side === 'left')
              ? { x1: xEnd - a.textWidth, y1: finalY - lineHeight, x2: xEnd, y2: finalY }
              : { x1: xEnd, y1: finalY - lineHeight, x2: xEnd + a.textWidth, y2: finalY };
            const overlapPenalty = boxesRef.some(b => boxesOverlap(box, b)) ? 1000 : 0;
            const score = sc + overlapPenalty;
            if (score === 0) { bestPath = p; bestScore = 0; break; }
            if (score < bestScore) { bestPath = p; bestScore = score; }
          }
        }

        // 应用整体平移到路径与文本位置（水平/垂直均可移动）
        textX += tx;
        bestPath = bestPath.map(s => ({
          a: { x: s.a.x + tx, y: s.a.y + ty },
          b: { x: s.b.x + tx, y: s.b.y + ty }
        }));

        // 预计算文本基线Y用于记录矩形；若使用手动路径将于下方覆盖
        let finalTextYForRect = bestPath[0].a.y - TEXT_GAP;
        // 只有可见的标注才绘制引线和文本
        if (a.item.isVisible !== false) {
          // 若存在手动把手位置（世界坐标），将其转换并替换对应段以实现可拖拽效果
            const offRawLocal = labelOffsetsRef.current?.[a.item.key];
            const manualLocal = offRawLocal && offRawLocal.leaderManual ? offRawLocal.leaderManual : null;
            let segsToDraw = bestPath;
            let finalAnchor = anchor;
            if (manualLocal && manualLocal.anchorWorld) {
              finalAnchor = toCanvas(manualLocal.anchorWorld);
              // 保持与文本偏移一致
              finalAnchor = { x: finalAnchor.x + tx, y: finalAnchor.y + ty };
            }
            // support manual endWorld (horizontal start) and elbowWorld (horiz end)
            let usedPathForText = bestPath;
            if (manualLocal && (manualLocal.elbowWorld || manualLocal.endWorld)) {
              // 仅当从世界坐标转换时才应用 tx/ty；bestPath 已包含偏移
              const elbowCanvas = manualLocal.elbowWorld
                ? (() => { const p = toCanvas(manualLocal.elbowWorld); return { x: p.x + tx, y: p.y + ty }; })()
                : bestPath[0].b;
              const endCanvas = manualLocal.endWorld
                ? (() => { const p = toCanvas(manualLocal.endWorld); return { x: p.x + tx, y: p.y + ty }; })()
                : bestPath[0].a;
              segsToDraw = [
                { a: endCanvas, b: elbowCanvas },
                { a: elbowCanvas, b: finalAnchor }
              ];
              usedPathForText = segsToDraw;
              // 文本对齐点直接取“拐点”X（elbowCanvas.x）
              if (side === 'left') { textX = elbowCanvas.x; ctx.textAlign = 'right'; }
              else { textX = elbowCanvas.x; ctx.textAlign = 'left'; }
            }
            drawSegmentsOrth(segsToDraw, { ...a.item, anchor: finalAnchor });

          // 绘制文本（基线底部），确保在水平线正上方且末端对齐路径的水平末端
          const finalTextY = usedPathForText[0].a.y - TEXT_GAP;
          // 标注文本始终为黑色
          ctx.fillStyle = '#000';
          ctx.fillText(a.labelText, textX, finalTextY);
          // 同步用于记录矩形的文本Y
          finalTextYForRect = finalTextY;
        }

        // 记录文本框（用于后续避让）和布局信息
        const finalTextY = finalTextYForRect; // 与实际绘制的水平段保持一致
        const y1 = finalTextY - lineHeight;
        const y2 = finalTextY;
        const rect = side === 'left'
          ? { x1: textX - a.textWidth, y1, x2: textX, y2 }
          : { x1: textX, y1, x2: textX + a.textWidth, y2 };
        
        // 只有可见且有文本的标注才记录文本框用于避让（避免空白框）
        if (a.item.isVisible !== false && a.labelText && String(a.labelText).trim().length > 0) {
          if (side === 'left') labelBoxesLeft.push(rect); else labelBoxesRight.push(rect);
        }

        // 记录布局用于命中与拖拽（包括隐藏的），但保存额外属性以供移动模式绘制时判断
        labelLayoutsRef.current.push({ key: a.item.key, rect, side, isVisible: a.item.isVisible !== false, text: a.labelText });
      }
    };

    const chosenLeft = [];
    const chosenRight = [];
    for (const it of visibleItems) {
      const sd = determineSideForItem(it);
      if (sd === 'left') chosenLeft.push(it); else chosenRight.push(it);
    }
    placeItemsOnSide(chosenLeft, 'left', 0);
    placeItemsOnSide(chosenRight, 'right', 0);
  };

  // 事件处理：触摸与滚轮（禁用页面默认缩放/滚动）
  const onTouchStart = (e) => {
    e.preventDefault();
    if (!interactionEnabled) return;
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      setLastPinchDistance(dist);
    } else if (e.touches.length === 1) {
      const now = Date.now();
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = rect ? e.touches[0].clientX - rect.left : e.touches[0].clientX;
      const cy = rect ? e.touches[0].clientY - rect.top : e.touches[0].clientY;
      lastTouchPosRef.current = { x: cx, y: cy };
      movedDistanceRef.current = 0;
      if (now - lastTapTimeRef.current < 300) {
        const nextScale = clampScale(scaleRef.current * 1.2);
        animateScaleAtPivot(nextScale, cx, cy, { duration: 220 });
        lastTapTimeRef.current = 0;
        return;
      }
      lastTapTimeRef.current = now;
      // 移动模式：命中字/组件/配件则开始对应拖拽；否则进入画布拖拽
      if (uiMode === 'move') {
        const hit = hitTestAtCanvasPoint(cx, cy);
        if (hit?.leaderHandle) {
          // 需求3：拐点紫色圆点仅可点击切换方向，不可拖拽
          if (hit.leaderHandle.handle !== 'elbow') {
            isDraggingLeaderPointRef.current = true;
            draggingLeaderPointRef.current = hit.leaderHandle; // { key, handle }
            lastTouchPosRef.current = { x: cx, y: cy };
            return;
          }
        }
        if (hit?.componentResize) {
          // 开始房间右下角控制点拖拽调整大小
          const comp = hit.componentResize.component;
          const r = getComponentHandleRect(comp);
          isResizingRoomRef.current = true;
          resizingComponentRef.current = comp;
          resizeAnchorTLRef.current = { x: r.x1, y: r.y1 };
          initialSizeRef.current = { w: r.x2 - r.x1, h: r.y2 - r.y1 };
          lastTouchPosRef.current = { x: cx, y: cy };
          return;
        }
        if (hit?.label) {
          isDraggingLabelRef.current = true;
          draggingLabelKeyRef.current = hit.label.key;
          return;
        }
        if (hit?.component) {
          draggingComponentRef.current = hit.component;
          isDraggingComponentRef.current = true;
          if (PLANE_ONLY_COMPONENT_TYPES.has(hit.component.type)) {
            const eff = (scaleRef.current || scale) * BASE_VISUAL_SCALE;
            const offset = offsetRef.current || canvasOffset;
            const wx = (cx - offset.x) / eff;
            const wy = (cy - offset.y) / eff;
            planeComponentDragOffsetRef.current = {
              dx: (hit.component.x ?? 0) - wx,
              dy: (hit.component.y ?? 0) - wy
            };
          } else {
            planeComponentDragOffsetRef.current = { dx: 0, dy: 0 };
          }
          return;
        }
        if (hit?.fitting) {
          draggingFittingRef.current = hit.fitting;
          isDraggingFittingRef.current = true;
          return;
        }
      }
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - canvasOffset.x, y: e.touches[0].clientY - canvasOffset.y });
      // 不再使用长按选中，改为在触摸结束时根据位移阈值判断为“轻触”并选中
    }
  };

  const onTouchMove = (e) => {
    e.preventDefault();
    if (!interactionEnabled) return;
    if (e.touches.length === 2 && lastPinchDistance !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = canvasRef.current?.getBoundingClientRect();
      const pivotX = rect ? (t1.clientX + t2.clientX) / 2 - rect.left : (t1.clientX + t2.clientX) / 2;
      const pivotY = rect ? (t1.clientY + t2.clientY) / 2 - rect.top : (t1.clientY + t2.clientY) / 2;
      const factor = newDist / lastPinchDistance;
      const nextScale = clampScale(scaleRef.current * factor);
      // 捏合保持即时响应，不使用动画
      applyZoomAtPivot(nextScale, pivotX, pivotY);
      setLastPinchDistance(newDist);
      onSaveDebounced && onSaveDebounced();
    } else if (e.touches.length === 1) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = rect ? e.touches[0].clientX - rect.left : e.touches[0].clientX;
      const cy = rect ? e.touches[0].clientY - rect.top : e.touches[0].clientY;
      // 房间大小调整拖拽（移动模式，触摸）
      if (isResizingRoomRef.current && resizingComponentRef.current) {
        const anchor = resizeAnchorTLRef.current;
        const minPx = 20;
        const newWpx = Math.max(minPx, cx - anchor.x);
        const newHpx = Math.max(minPx, cy - anchor.y);
        const eff = scale * BASE_VISUAL_SCALE;
        const centerX = anchor.x + newWpx / 2;
        const centerY = anchor.y + newHpx / 2;
        const wx = (centerX - canvasOffset.x) / eff;
        const wy = (centerY - canvasOffset.y) / eff;
        // 画布像素 -> 世界尺寸，必须除以 eff（scale*BASE_VISUAL_SCALE）
        const newW = newWpx / eff;
        const newH = newHpx / eff;
        const targetId = resizingComponentRef.current.id;
        setComponents(prev => {
          const roomOld = (prev || []).find(rc => rc && rc.id === targetId);
          const wall = Math.max(1, roomOld?.wall ?? 6);
          const hx = Math.max(10, newW) / 2;
          const hy = Math.max(10, newH) / 2;
          const innerLeftX = wx - hx + wall / 2;
          const innerRightX = wx + hx - wall / 2;
          const innerBottomY = wy - hy + wall / 2;
          const innerTopY = wy + hy - wall / 2;
          const Lx = Math.max(1e-6, innerRightX - innerLeftX);
          const Ly = Math.max(1e-6, innerTopY - innerBottomY);
          return (prev || []).map(c => {
            if (!c) return c;
            if (c.id === targetId) {
              return { ...c, x: wx, y: wy, w: Math.max(10, newW), h: Math.max(10, newH) };
            }
            if ((c.type === 'window' || c.type === 'door') && String(c.roomId) === String(targetId)) {
              const t = Math.max(0, Math.min(1, Number(c.wallPos ?? 0.5)));
              if (c.wallSide === 'top') {
                const nx = innerLeftX + Lx * t; const ny = innerTopY;
                return { ...c, x: nx, y: ny };
              } else if (c.wallSide === 'bottom') {
                const nx = innerLeftX + Lx * t; const ny = innerBottomY;
                return { ...c, x: nx, y: ny };
              } else if (c.wallSide === 'left') {
                const ny = innerBottomY + Ly * t; const nx = innerLeftX;
                return { ...c, x: nx, y: ny };
              } else if (c.wallSide === 'right') {
                const ny = innerBottomY + Ly * t; const nx = innerRightX;
                return { ...c, x: nx, y: ny };
              }
            }
            return c;
          });
        });
        movedDistanceRef.current = Math.hypot(cx - lastTouchPosRef.current.x, cy - lastTouchPosRef.current.y);
        lastTouchPosRef.current = { x: cx, y: cy };
        needsRedrawRef.current = true;
        onSaveDebounced && onSaveDebounced();
        return;
      }
      // 组件拖拽（移动模式）
      if (isDraggingComponentRef.current && draggingComponentRef.current) {
        const eff = scale * BASE_VISUAL_SCALE;
        const wx = (cx - canvasOffset.x) / eff;
        const wy = (cy - canvasOffset.y) / eff;
        // 如果该组件有原始 segmentId，则保持在该段上投影移动；否则吸附到最近段
        const dx = cx - lastTouchPosRef.current.x;
        const dy = cy - lastTouchPosRef.current.y;
        movedDistanceRef.current = Math.hypot(dx, dy);
        const type = draggingComponentRef.current?.type;
        const isPlane = type === 'room' || type === 'door' || type === 'window';
        if (isPlane) {
          // 平面类型：自由拖拽到指针世界坐标
          if (onMoveComponent) {
            const planeOffset = planeComponentDragOffsetRef.current || { dx: 0, dy: 0 };
            const offsetDx = Number.isFinite(planeOffset.dx) ? planeOffset.dx : 0;
            const offsetDy = Number.isFinite(planeOffset.dy) ? planeOffset.dy : 0;
            const targetX = wx + offsetDx;
            const targetY = wy + offsetDy;
            onMoveComponent({ id: draggingComponentRef.current.id, segmentId: null, x: targetX, y: targetY });
            onSaveDebounced && onSaveDebounced();
          }
        } else {
          let targetSeg = null;
          let targetPoint = null;
          const fixedSegId = draggingComponentRef.current && draggingComponentRef.current.segmentId;
          if (fixedSegId) {
            const seg = segments.find(s => s.id === fixedSegId);
            if (seg) {
              // 将指针投影到该段（世界坐标），并 clamp 到 [0,1]
              const x1 = seg.startPoint.x, y1 = seg.startPoint.y;
              const x2 = seg.endPoint.x, y2 = seg.endPoint.y;
              const C = x2 - x1, D = y2 - y1;
              const lenSq = C * C + D * D || 1;
              let param = ((wx - x1) * C + (wy - y1) * D) / lenSq;
              if (param < 0) param = 0; else if (param > 1) param = 1;
              targetPoint = { x: x1 + param * C, y: y1 + param * D };
              targetSeg = seg;
            }
          }
          if (!targetSeg) {
            const { segment, segmentPoint } = computeNearestSegmentPoint(wx, wy);
            targetSeg = segment; targetPoint = segmentPoint;
          }
          if (targetSeg && targetPoint) {
            if (isPlaneView && onMoveComponentPlan) {
              onMoveComponentPlan({ id: draggingComponentRef.current.id, segmentId: targetSeg.id, x: targetPoint.x, y: targetPoint.y });
            } else if (onMoveComponent) {
              onMoveComponent({ id: draggingComponentRef.current.id, segmentId: targetSeg.id, x: targetPoint.x, y: targetPoint.y });
            }
            onSaveDebounced && onSaveDebounced();
          } else if (isPlaneView && onMoveComponentPlan) {
            onMoveComponentPlan({ id: draggingComponentRef.current.id, segmentId: null, x: wx, y: wy });
            onSaveDebounced && onSaveDebounced();
          }
        }
        lastTouchPosRef.current = { x: cx, y: cy };
        return;
      }
      // 配件拖拽（移动模式）
      if (isDraggingFittingRef.current && draggingFittingRef.current) {
        const eff = scale * BASE_VISUAL_SCALE;
        const wx = (cx - canvasOffset.x) / eff;
        const wy = (cy - canvasOffset.y) / eff;
        const { segment, segmentPoint } = computeNearestSegmentPoint(wx, wy);
        const dx = cx - lastTouchPosRef.current.x;
        const dy = cy - lastTouchPosRef.current.y;
        movedDistanceRef.current = Math.hypot(dx, dy);
        if (segment && segmentPoint) {
          if (isPlaneView && onMoveFittingPlan) {
            onMoveFittingPlan({ id: draggingFittingRef.current.id, segmentId: segment.id, x: segmentPoint.x, y: segmentPoint.y });
          } else if (onMoveFitting) {
            onMoveFitting({ id: draggingFittingRef.current.id, segmentId: segment.id, x: segmentPoint.x, y: segmentPoint.y });
          }
          onSaveDebounced && onSaveDebounced();
        } else if (isPlaneView && onMoveFittingPlan) {
          onMoveFittingPlan({ id: draggingFittingRef.current.id, segmentId: null, x: wx, y: wy });
          onSaveDebounced && onSaveDebounced();
        }
        lastTouchPosRef.current = { x: cx, y: cy };
        return;
      }
      // 文本标注拖拽（移动模式）
      if (isDraggingLeaderPointRef.current && draggingLeaderPointRef.current) {
        const dx = cx - lastTouchPosRef.current.x;
        const dy = cy - lastTouchPosRef.current.y;
        movedDistanceRef.current = Math.hypot(dx, dy);
        const eff = scale * BASE_VISUAL_SCALE;
        const wx = (cx - canvasOffset.x) / eff;
        const wy = (cy - canvasOffset.y) / eff;
        const { key, handle } = draggingLeaderPointRef.current;
        labelOffsetsRef.current[key] = labelOffsetsRef.current[key] || {};
        labelOffsetsRef.current[key].leaderManual = labelOffsetsRef.current[key].leaderManual || {};
        const lh = (leaderHandlesRef.current || []).find(z => z && z.key === key);
        if (handle === 'tip') {
          // constrain tip movement along its pipe segment when possible
          if (lh && lh.segmentId) {
            const seg = segments.find(s => s.id === lh.segmentId);
            if (seg) {
              const x1 = seg.startPoint.x, y1 = seg.startPoint.y;
              const x2 = seg.endPoint.x, y2 = seg.endPoint.y;
              const C = x2 - x1, D = y2 - y1;
              const segLen = Math.hypot(C, D) || 1;
              let t = ((wx - x1) * C + (wy - y1) * D) / (segLen * segLen);
              const minPx = 12; const effLocal = scale * BASE_VISUAL_SCALE;
              const minT = Math.min(0.45, Math.max(0, (minPx / effLocal) / (segLen || 1)));
              t = Math.max(minT, Math.min(1 - minT, t));
              labelOffsetsRef.current[key].leaderManual.tipWorld = { x: x1 + t * C, y: y1 + t * D };
            } else {
              labelOffsetsRef.current[key].leaderManual.tipWorld = { x: wx, y: wy };
            }
          } else {
            // 需求2：组件多顶点（如铜球阀）时，tip 只能吸附到其顶点
            if (key && String(key).startsWith('component:')) {
              try {
                const idStr = String(key).split(':')[1];
                const comp = components.find(c => String(c.id) === String(idStr));
                const verts = comp ? getComponentSnapVerticesWorld(comp) : [];
                if (verts && verts.length) {
                  let best = verts[0];
                  let minD = Infinity;
                  for (const v of verts) {
                    const d = Math.hypot(v.x - wx, v.y - wy);
                    if (d < minD) { minD = d; best = v; }
                  }
                  labelOffsetsRef.current[key].leaderManual.tipWorld = { x: best.x, y: best.y };
                } else {
                  labelOffsetsRef.current[key].leaderManual.tipWorld = { x: wx, y: wy };
                }
              } catch {
                labelOffsetsRef.current[key].leaderManual.tipWorld = { x: wx, y: wy };
              }
            } else {
              labelOffsetsRef.current[key].leaderManual.tipWorld = { x: wx, y: wy };
            }
          }
        } else if (handle === 'end') {
            // The 'end' handle toggles the horizontal segment direction (left/right) without changing length.
            // Move the label text together so relative position is preserved.
            const effLocal = scale * BASE_VISUAL_SCALE;
            // compute elbow world position
            let elbowWorld = null;
            if (labelOffsetsRef.current[key] && labelOffsetsRef.current[key].leaderManual && labelOffsetsRef.current[key].leaderManual.elbowWorld) {
              elbowWorld = labelOffsetsRef.current[key].leaderManual.elbowWorld;
            } else if (lh && lh.elbow) {
              elbowWorld = { x: (lh.elbow.x - canvasOffset.x) / effLocal, y: (lh.elbow.y - canvasOffset.y) / effLocal };
            }
            // previous end world
            let prevEndWorld = null;
            if (labelOffsetsRef.current[key] && labelOffsetsRef.current[key].leaderManual && labelOffsetsRef.current[key].leaderManual.endWorld) {
              prevEndWorld = labelOffsetsRef.current[key].leaderManual.endWorld;
            } else if (lh && lh.end) {
              prevEndWorld = { x: (lh.end.x - canvasOffset.x) / effLocal, y: (lh.end.y - canvasOffset.y) / effLocal };
            }
            if (!elbowWorld) {
              // fallback: just set end to pointer point
              labelOffsetsRef.current[key].leaderManual.endWorld = { x: wx, y: wy };
            } else {
              const horizLen = prevEndWorld ? Math.abs(prevEndWorld.x - elbowWorld.x) : Math.abs((wx) - elbowWorld.x) || 1;
              const dir = (wx - elbowWorld.x) >= 0 ? 1 : -1;
              const newEndX = elbowWorld.x + dir * horizLen;
              const newEndY = elbowWorld.y;
              const newEnd = { x: newEndX, y: newEndY };
              labelOffsetsRef.current[key].leaderManual.endWorld = newEnd;
              // move label text together: adjust dxWorld by the delta
              const curOff = labelOffsetsRef.current[key] || {};
              const curDx = (curOff.dxWorld ?? curOff.dx ?? 0);
              const deltaX = newEndX - (prevEndWorld ? prevEndWorld.x : newEndX);
              labelOffsetsRef.current[key] = {
                ...(labelOffsetsRef.current[key] || {}),
                dxWorld: curDx + deltaX
              };
            }
        } else if (handle === 'elbow') {
          labelOffsetsRef.current[key].leaderManual.elbowWorld = { x: wx, y: wy };
        } else if (handle === 'anchor') {
          labelOffsetsRef.current[key].leaderManual.anchorWorld = { x: wx, y: wy };
        }
        lastTouchPosRef.current = { x: cx, y: cy };
        needsRedrawRef.current = true;
        return;
      }

      if (isDraggingLabelRef.current && draggingLabelKeyRef.current) {
        const dx = cx - lastTouchPosRef.current.x;
        const dy = cy - lastTouchPosRef.current.y;
        movedDistanceRef.current = Math.hypot(dx, dy);
        const eff = scale * BASE_VISUAL_SCALE;
        const key = draggingLabelKeyRef.current;
        const cur = labelOffsetsRef.current[key] || { dxWorld: 0, dyWorld: 0 };
        // 仅更新偏移，保留已有 leaderManual 等属性，避免拖拽导致已翻转方向丢失
        labelOffsetsRef.current[key] = {
          ...(labelOffsetsRef.current[key] || {}),
          dxWorld: (cur.dxWorld ?? 0) + dx / eff,
          dyWorld: (cur.dyWorld ?? 0) + dy / eff,
        };
        lastTouchPosRef.current = { x: cx, y: cy };
        needsRedrawRef.current = true;
        return;
      }
      // 画布拖拽
      if (isDragging) {
        const now = performance.now();
        const curX = e.touches[0].clientX;
        const curY = e.touches[0].clientY;
        const dx = curX - (dragStart.x + canvasOffset.x);
        const dy = curY - (dragStart.y + canvasOffset.y);
        movedDistanceRef.current = Math.hypot(dx, dy);
        // 速度记录（像素/毫秒）
        if (!lastDragTsRef.current) {
          lastDragTsRef.current = now;
          lastDragPosRef.current = { x: curX, y: curY };
        } else {
          const dt = Math.max(1, now - lastDragTsRef.current);
          const vx = (curX - lastDragPosRef.current.x) / dt;
          const vy = (curY - lastDragPosRef.current.y) / dt;
          dragVelRef.current = { vx, vy };
          lastDragTsRef.current = now;
          lastDragPosRef.current = { x: curX, y: curY };
        }
        setCanvasOffset({ x: curX - dragStart.x, y: curY - dragStart.y });
        onSaveDebounced && onSaveDebounced();
      }
    }
  };

  const onTouchEnd = () => {
    const wasDragging = isDragging;
    setIsDragging(false);
    setLastPinchDistance(null);
    // 结束组件/配件/文本拖拽
    if (isResizingRoomRef.current) {
      isResizingRoomRef.current = false;
      resizingComponentRef.current = null;
      onSaveImmediate && onSaveImmediate();
    }
    if (isDraggingComponentRef.current) {
      isDraggingComponentRef.current = false;
      draggingComponentRef.current = null;
      onSaveImmediate && onSaveImmediate();
    }
    if (isDraggingFittingRef.current) {
      isDraggingFittingRef.current = false;
      draggingFittingRef.current = null;
      onSaveImmediate && onSaveImmediate();
    }
    if (isDraggingLabelRef.current) {
      isDraggingLabelRef.current = false;
      draggingLabelKeyRef.current = null;
      // 将偏移写回上层并保存
      onUpdateLabelOffsets && onUpdateLabelOffsets(labelOffsetsRef.current);
      onSaveImmediate && onSaveImmediate();
    }
    if (isDraggingLeaderPointRef.current) {
      isDraggingLeaderPointRef.current = false;
      draggingLeaderPointRef.current = null;
      onUpdateLabelOffsets && onUpdateLabelOffsets(labelOffsetsRef.current);
      onSaveImmediate && onSaveImmediate();
    }
    if (isDraggingLeaderPointRef.current) {
      isDraggingLeaderPointRef.current = false;
      draggingLeaderPointRef.current = null;
      // persist leader manual handles
      onUpdateLabelOffsets && onUpdateLabelOffsets(labelOffsetsRef.current);
      onSaveImmediate && onSaveImmediate();
    }
    // 轻触（点击）选中：位移阈值内则认为是点击
    const moved = movedDistanceRef.current || 0;
    const { x, y } = lastTouchPosRef.current || { x: 0, y: 0 };
    if (moved < 6) {
      const hit = hitTestAtCanvasPoint(x, y);
      const eff = scale * BASE_VISUAL_SCALE;
      const worldPoint = { x: (x - canvasOffset.x) / eff, y: (y - canvasOffset.y) / eff };
      // 需求1&3：轻触拐点切换水平线方向，文本跟随切换
      if (hit && hit.leaderHandle && hit.leaderHandle.handle === 'elbow') {
        const { key } = hit.leaderHandle;
        labelOffsetsRef.current[key] = labelOffsetsRef.current[key] || {};
        labelOffsetsRef.current[key].leaderManual = labelOffsetsRef.current[key].leaderManual || {};
        const lh = (leaderHandlesRef.current || []).find(z => z && z.key === key);
        const effLocal = scale * BASE_VISUAL_SCALE;
        // elbow/end 世界坐标
        let elbowWorld = null;
        if (labelOffsetsRef.current[key].leaderManual && labelOffsetsRef.current[key].leaderManual.elbowWorld) {
          elbowWorld = labelOffsetsRef.current[key].leaderManual.elbowWorld;
        } else if (lh && lh.elbow) {
          elbowWorld = { x: (lh.elbow.x - canvasOffset.x) / effLocal, y: (lh.elbow.y - canvasOffset.y) / effLocal };
        }
        let prevEndWorld = null;
        if (labelOffsetsRef.current[key].leaderManual && labelOffsetsRef.current[key].leaderManual.endWorld) {
          prevEndWorld = labelOffsetsRef.current[key].leaderManual.endWorld;
        } else if (lh && lh.end) {
          prevEndWorld = { x: (lh.end.x - canvasOffset.x) / effLocal, y: (lh.end.y - canvasOffset.y) / effLocal };
        }
        if (elbowWorld) {
          if (!prevEndWorld) prevEndWorld = { x: elbowWorld.x + (12 / effLocal), y: elbowWorld.y };
          // 围绕拐点进行水平镜像：newEndX = 2 * elbow.x - prevEnd.x
          const newEndX = elbowWorld.x * 2 - prevEndWorld.x;
          const newEnd = { x: newEndX, y: elbowWorld.y };
          labelOffsetsRef.current[key].leaderManual.endWorld = newEnd;
          // 锁定拐点位置：点击翻转不应改变拐点
          if (!labelOffsetsRef.current[key].leaderManual.elbowWorld) {
            labelOffsetsRef.current[key].leaderManual.elbowWorld = elbowWorld;
          }
          // 文本仅作水平方向跟随：统一采用世界坐标的水平位移差
          const curOff = labelOffsetsRef.current[key] || {};
          const curDx = (curOff.dxWorld ?? curOff.dx ?? 0);
          const deltaX = newEndX - prevEndWorld.x;
          labelOffsetsRef.current[key] = { ...(labelOffsetsRef.current[key] || {}), dxWorld: curDx + deltaX };
          onUpdateLabelOffsets && onUpdateLabelOffsets(labelOffsetsRef.current);
          onSaveImmediate && onSaveImmediate();
          needsRedrawRef.current = true;
          return; // 仅执行拐点切换逻辑
        }
      }
      // 默认轻触选中逻辑（附带 worldPoint）
      if (hit) {
        const normalized = normalizeHit(hit);
        onSelectionChange && onSelectionChange({ ...normalized, worldPoint });
        onSaveDebounced && onSaveDebounced();
      } else {
        onSelectionChange && onSelectionChange({ segment: null, component: null, fitting: null, endpoint: null, worldPoint });
      }
    }
    // 惯性滑动：仅对画布拖拽生效
    if (wasDragging && moved >= 6 && !isDraggingComponentRef.current && !isDraggingFittingRef.current && !isDraggingLabelRef.current) {
      const { vx = 0, vy = 0 } = dragVelRef.current || {};
      const speed = Math.hypot(vx, vy);
      const decayMs = 420; // 惯性时间
      const maxDist = 600; // 最大位移限制
      const dist = Math.min(maxDist, speed * decayMs);
      const targetX = offsetRef.current.x + vx * decayMs * 0.9;
      const targetY = offsetRef.current.y + vy * decayMs * 0.9;
    animatePanTo(targetX, targetY, { duration: decayMs, ease: 'out(2)' });
    }
    movedDistanceRef.current = 0;
    lastDragTsRef.current = 0;
    lastDragPosRef.current = { x: 0, y: 0 };
    dragVelRef.current = { vx: 0, vy: 0 };
    onSaveImmediate && onSaveImmediate();
  };

  const onWheel = (e) => {
    e.preventDefault();
    if (!interactionEnabled) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const pivotX = rect ? e.clientX - rect.left : e.clientX;
    const pivotY = rect ? e.clientY - rect.top : e.clientY;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextScale = clampScale(scaleRef.current * factor);
    animateScaleAtPivot(nextScale, pivotX, pivotY, { duration: 180 });
  };

  // 鼠标事件（桌面）：与触摸逻辑一致，支持拖拽与点击选择
  const onMouseDown = (e) => {
    e.preventDefault();
    if (!interactionEnabled) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? e.clientX - rect.left : e.clientX;
    const cy = rect ? e.clientY - rect.top : e.clientY;
    lastTouchPosRef.current = { x: cx, y: cy };
    movedDistanceRef.current = 0;
    // 移动模式：命中文本/组件/配件则开始对应拖拽
    if (uiMode === 'move') {
      const hit = hitTestAtCanvasPoint(cx, cy);
      if (hit?.leaderHandle) {
        // 需求3：拐点紫色圆点仅可点击切换方向，不可拖拽
        if (hit.leaderHandle.handle !== 'elbow') {
          isDraggingLeaderPointRef.current = true;
          draggingLeaderPointRef.current = hit.leaderHandle; // { key, handle }
          lastTouchPosRef.current = { x: cx, y: cy };
          return;
        }
      }
      if (hit?.componentResize) {
        const comp = hit.componentResize.component;
        const r = getComponentHandleRect(comp);
        isResizingRoomRef.current = true;
        resizingComponentRef.current = comp;
        resizeAnchorTLRef.current = { x: r.x1, y: r.y1 };
        initialSizeRef.current = { w: r.x2 - r.x1, h: r.y2 - r.y1 };
        lastTouchPosRef.current = { x: cx, y: cy };
        return;
      }
      if (hit?.label) {
        isDraggingLabelRef.current = true;
        draggingLabelKeyRef.current = hit.label.key;
        return;
      }
      if (hit?.component) {
        draggingComponentRef.current = hit.component;
        isDraggingComponentRef.current = true;
        if (PLANE_ONLY_COMPONENT_TYPES.has(hit.component.type)) {
          const eff = (scaleRef.current || scale) * BASE_VISUAL_SCALE;
          const offset = offsetRef.current || canvasOffset;
          const wx = (cx - offset.x) / eff;
          const wy = (cy - offset.y) / eff;
          planeComponentDragOffsetRef.current = {
            dx: (hit.component.x ?? 0) - wx,
            dy: (hit.component.y ?? 0) - wy
          };
        } else {
          planeComponentDragOffsetRef.current = { dx: 0, dy: 0 };
        }
        return;
      }
      if (hit?.fitting) {
        draggingFittingRef.current = hit.fitting;
        isDraggingFittingRef.current = true;
        return;
      }
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y });
  };

  const onMouseMove = (e) => {
    e.preventDefault();
    if (!interactionEnabled) return;

    // 辅助：根据当前鼠标世界坐标计算最近管段及投影点（不受节点命中影响）
    const computeNearestSegmentPoint = (wx, wy) => {
      let bestSeg = null;
      let bestDist = Infinity;
      let segPoint = null;
      let t = 0;
      segments.forEach(s => {
        const d = distancePointToSegment(wx, wy, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
        if (d < bestDist) {
          bestDist = d;
          bestSeg = s;
          const x1 = s.startPoint.x, y1 = s.startPoint.y;
          const x2 = s.endPoint.x, y2 = s.endPoint.y;
          const dx = x2 - x1, dy = y2 - y1;
          const lenSq = dx * dx + dy * dy;
          const t0 = lenSq !== 0 ? ((wx - x1) * dx + (wy - y1) * dy) / lenSq : 0;
          t = Math.max(0, Math.min(1, t0));
          segPoint = { x: x1 + t * dx, y: y1 + t * dy };
        }
      });
      return { segment: bestSeg, segmentPoint: segPoint, t };
    };

    // 房间大小调整拖拽（移动模式，鼠标）
    if (isResizingRoomRef.current && resizingComponentRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = rect ? e.clientX - rect.left : e.clientX;
      const cy = rect ? e.clientY - rect.top : e.clientY;
      movedDistanceRef.current = Math.hypot(cx - lastTouchPosRef.current.x, cy - lastTouchPosRef.current.y);
      const anchor = resizeAnchorTLRef.current;
      const minPx = 20;
      const newWpx = Math.max(minPx, cx - anchor.x);
      const newHpx = Math.max(minPx, cy - anchor.y);
      const eff = scale * BASE_VISUAL_SCALE;
      const centerX = anchor.x + newWpx / 2;
      const centerY = anchor.y + newHpx / 2;
      const wx = (centerX - canvasOffset.x) / eff;
      const wy = (centerY - canvasOffset.y) / eff;
      // 画布像素 -> 世界尺寸，必须除以 eff（scale*BASE_VISUAL_SCALE）
      const newW = newWpx / eff;
      const newH = newHpx / eff;
      const targetId = resizingComponentRef.current.id;
      setComponents(prev => {
        const roomOld = (prev || []).find(rc => rc && rc.id === targetId);
        const wall = Math.max(1, roomOld?.wall ?? 6);
        const hx = Math.max(10, newW) / 2;
        const hy = Math.max(10, newH) / 2;
        const innerLeftX = wx - hx + wall / 2;
        const innerRightX = wx + hx - wall / 2;
        const innerBottomY = wy - hy + wall / 2;
        const innerTopY = wy + hy - wall / 2;
        const Lx = Math.max(1e-6, innerRightX - innerLeftX);
        const Ly = Math.max(1e-6, innerTopY - innerBottomY);
        return (prev || []).map(c => {
          if (!c) return c;
          if (c.id === targetId) {
            return { ...c, x: wx, y: wy, w: Math.max(10, newW), h: Math.max(10, newH) };
          }
          if ((c.type === 'window' || c.type === 'door') && String(c.roomId) === String(targetId)) {
            const t = Math.max(0, Math.min(1, Number(c.wallPos ?? 0.5)));
            if (c.wallSide === 'top') {
              const nx = innerLeftX + Lx * t; const ny = innerTopY;
              return { ...c, x: nx, y: ny };
            } else if (c.wallSide === 'bottom') {
              const nx = innerLeftX + Lx * t; const ny = innerBottomY;
              return { ...c, x: nx, y: ny };
            } else if (c.wallSide === 'left') {
              const ny = innerBottomY + Ly * t; const nx = innerLeftX;
              return { ...c, x: nx, y: ny };
            } else if (c.wallSide === 'right') {
              const ny = innerBottomY + Ly * t; const nx = innerRightX;
              return { ...c, x: nx, y: ny };
            }
          }
          return c;
        });
      });
      lastTouchPosRef.current = { x: cx, y: cy };
      needsRedrawRef.current = true;
      onSaveDebounced && onSaveDebounced();
      return;
    }

    // 组件或配件拖拽：沿最近管线吸附并通知上层更新（平面类型自由拖拽）
    if (isDraggingComponentRef.current && draggingComponentRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = rect ? e.clientX - rect.left : e.clientX;
      const cy = rect ? e.clientY - rect.top : e.clientY;
      const dx = e.clientX - (dragStart.x + canvasOffset.x);
      const dy = e.clientY - (dragStart.y + canvasOffset.y);
      movedDistanceRef.current = Math.hypot(dx, dy);
      const eff = scale * BASE_VISUAL_SCALE;
      const wx = (cx - canvasOffset.x) / eff;
      const wy = (cy - canvasOffset.y) / eff;
      const type = draggingComponentRef.current?.type;
      const isPlane = type === 'room' || type === 'door' || type === 'window';
      if (isPlane) {
        // 平面类型：按按下时记录的偏移校正鼠标位置，避免拖拽跳闪
        if (onMoveComponent) {
          const planeOffset = planeComponentDragOffsetRef.current || { dx: 0, dy: 0 };
          const offsetDx = Number.isFinite(planeOffset.dx) ? planeOffset.dx : 0;
          const offsetDy = Number.isFinite(planeOffset.dy) ? planeOffset.dy : 0;
          const targetX = wx + offsetDx;
          const targetY = wy + offsetDy;
          onMoveComponent({ id: draggingComponentRef.current.id, segmentId: null, x: targetX, y: targetY });
          onSaveDebounced && onSaveDebounced();
        }
      } else {
        // 保持已插入组件在其原始 segment 上移动（若存在），否则吸附到最近段
        let targetSeg = null;
        let targetPoint = null;
        const fixedSegId = draggingComponentRef.current && draggingComponentRef.current.segmentId;
        if (fixedSegId) {
          const seg = segments.find(s => s.id === fixedSegId);
          if (seg) {
            const x1 = seg.startPoint.x, y1 = seg.startPoint.y;
            const x2 = seg.endPoint.x, y2 = seg.endPoint.y;
            const C = x2 - x1, D = y2 - y1;
            const lenSq = C * C + D * D || 1;
            let param = ((wx - x1) * C + (wy - y1) * D) / lenSq;
            if (param < 0) param = 0; else if (param > 1) param = 1;
            targetPoint = { x: x1 + param * C, y: y1 + param * D };
            targetSeg = seg;
          }
        }
        if (!targetSeg) {
          const { segment, segmentPoint } = computeNearestSegmentPoint(wx, wy);
          targetSeg = segment; targetPoint = segmentPoint;
        }
        if (targetSeg && targetPoint) {
          if (isPlaneView && onMoveComponentPlan) {
            onMoveComponentPlan({ id: draggingComponentRef.current.id, segmentId: targetSeg.id, x: targetPoint.x, y: targetPoint.y });
          } else if (onMoveComponent) {
            onMoveComponent({ id: draggingComponentRef.current.id, segmentId: targetSeg.id, x: targetPoint.x, y: targetPoint.y });
          }
          onSaveDebounced && onSaveDebounced();
        } else if (isPlaneView && onMoveComponentPlan) {
          onMoveComponentPlan({ id: draggingComponentRef.current.id, segmentId: null, x: wx, y: wy });
          onSaveDebounced && onSaveDebounced();
        }
      }
      return;
    }

    if (isDraggingFittingRef.current && draggingFittingRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = rect ? e.clientX - rect.left : e.clientX;
      const cy = rect ? e.clientY - rect.top : e.clientY;
      const dx = e.clientX - (dragStart.x + canvasOffset.x);
      const dy = e.clientY - (dragStart.y + canvasOffset.y);
      movedDistanceRef.current = Math.hypot(dx, dy);
      const eff = scale * BASE_VISUAL_SCALE;
      const wx = (cx - canvasOffset.x) / eff;
      const wy = (cy - canvasOffset.y) / eff;
      // 对配件同样做约束：如果已有 segmentId 则始终在该段上移动
      let targetSeg = null;
      let targetPoint = null;
      const fixedSegIdF = draggingFittingRef.current && draggingFittingRef.current.segmentId;
      if (fixedSegIdF) {
        const seg = segments.find(s => s.id === fixedSegIdF);
        if (seg) {
          const x1 = seg.startPoint.x, y1 = seg.startPoint.y;
          const x2 = seg.endPoint.x, y2 = seg.endPoint.y;
          const C = x2 - x1, D = y2 - y1;
          const lenSq = C * C + D * D || 1;
          let param = ((wx - x1) * C + (wy - y1) * D) / lenSq;
          if (param < 0) param = 0; else if (param > 1) param = 1;
          targetPoint = { x: x1 + param * C, y: y1 + param * D };
          targetSeg = seg;
        }
      }
      if (!targetSeg) {
        const { segment, segmentPoint } = computeNearestSegmentPoint(wx, wy);
        targetSeg = segment; targetPoint = segmentPoint;
      }
      if (targetSeg && targetPoint) {
        if (isPlaneView && onMoveFittingPlan) {
          onMoveFittingPlan({ id: draggingFittingRef.current.id, segmentId: targetSeg.id, x: targetPoint.x, y: targetPoint.y });
        } else if (onMoveFitting) {
          onMoveFitting({ id: draggingFittingRef.current.id, segmentId: targetSeg.id, x: targetPoint.x, y: targetPoint.y });
        }
        onSaveDebounced && onSaveDebounced();
      } else if (isPlaneView && onMoveFittingPlan) {
        onMoveFittingPlan({ id: draggingFittingRef.current.id, segmentId: null, x: wx, y: wy });
        onSaveDebounced && onSaveDebounced();
      }
      return;
    }

    // 文本标注拖拽（移动模式，桌面鼠标）
    if (isDraggingLeaderPointRef.current && draggingLeaderPointRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = rect ? e.clientX - rect.left : e.clientX;
      const cy = rect ? e.clientY - rect.top : e.clientY;
      movedDistanceRef.current = Math.hypot(cx - lastTouchPosRef.current.x, cy - lastTouchPosRef.current.y);
      const eff = scale * BASE_VISUAL_SCALE;
      const wx = (cx - canvasOffset.x) / eff;
      const wy = (cy - canvasOffset.y) / eff;
      const { key, handle } = draggingLeaderPointRef.current;
      labelOffsetsRef.current[key] = labelOffsetsRef.current[key] || {};
      labelOffsetsRef.current[key].leaderManual = labelOffsetsRef.current[key].leaderManual || {};
      const lh = (leaderHandlesRef.current || []).find(z => z && z.key === key);
      if (handle === 'tip') {
        // constrain tip movement along its segment when possible
        if (lh && lh.segmentId) {
          const seg = segments.find(s => s.id === lh.segmentId);
          if (seg) {
            const x1 = seg.startPoint.x, y1 = seg.startPoint.y;
            const x2 = seg.endPoint.x, y2 = seg.endPoint.y;
            const C = x2 - x1, D = y2 - y1;
            const segLen = Math.hypot(C, D) || 1;
            // project pointer to segment
            let t = ((wx - x1) * C + (wy - y1) * D) / (segLen * segLen);
            // prevent moving too close to endpoints (pixel-based min distance)
            const minPx = 12; const effLocal = scale * BASE_VISUAL_SCALE;
            const minT = Math.min(0.45, Math.max(0, (minPx / effLocal) / (segLen || 1)));
            t = Math.max(minT, Math.min(1 - minT, t));
            labelOffsetsRef.current[key].leaderManual.tipWorld = { x: x1 + t * C, y: y1 + t * D };
          } else {
            // fallback to free
            labelOffsetsRef.current[key].leaderManual.tipWorld = { x: wx, y: wy };
          }
        } else {
          // 需求2：组件多顶点（如铜球阀）时，tip 只能吸附到其顶点
          if (key && String(key).startsWith('component:')) {
            try {
              const idStr = String(key).split(':')[1];
              const comp = components.find(c => String(c.id) === String(idStr));
              const verts = comp ? getComponentSnapVerticesWorld(comp) : [];
              if (verts && verts.length) {
                let best = verts[0];
                let minD = Infinity;
                for (const v of verts) {
                  const d = Math.hypot(v.x - wx, v.y - wy);
                  if (d < minD) { minD = d; best = v; }
                }
                labelOffsetsRef.current[key].leaderManual.tipWorld = { x: best.x, y: best.y };
              } else {
                labelOffsetsRef.current[key].leaderManual.tipWorld = { x: wx, y: wy };
              }
            } catch {
              labelOffsetsRef.current[key].leaderManual.tipWorld = { x: wx, y: wy };
            }
          } else {
            labelOffsetsRef.current[key].leaderManual.tipWorld = { x: wx, y: wy };
          }
        }
      } else if (handle === 'end') {
        // end = horizontal segment start (text end). Keep it aligned with elbow's Y when available
        const manualLocal = labelOffsetsRef.current[key] && labelOffsetsRef.current[key].leaderManual ? labelOffsetsRef.current[key].leaderManual : null;
        let elbowWorldY = null;
        if (manualLocal && manualLocal.elbowWorld) elbowWorldY = manualLocal.elbowWorld.y;
        else if (lh && lh.elbow) {
          const effLocal = scale * BASE_VISUAL_SCALE;
          elbowWorldY = (lh.elbow.y - canvasOffset.y) / effLocal;
        }
        const endWorld = { x: wx, y: (elbowWorldY != null ? elbowWorldY : wy) };
        labelOffsetsRef.current[key].leaderManual.endWorld = endWorld;
      } else if (handle === 'elbow') {
        labelOffsetsRef.current[key].leaderManual.elbowWorld = { x: wx, y: wy };
      } else if (handle === 'anchor') {
        labelOffsetsRef.current[key].leaderManual.anchorWorld = { x: wx, y: wy };
      }
      lastTouchPosRef.current = { x: cx, y: cy };
      needsRedrawRef.current = true;
      return;
    }

    if (isDraggingLabelRef.current && draggingLabelKeyRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = rect ? e.clientX - rect.left : e.clientX;
      const cy = rect ? e.clientY - rect.top : e.clientY;
      const dx = cx - lastTouchPosRef.current.x;
      const dy = cy - lastTouchPosRef.current.y;
      movedDistanceRef.current = Math.hypot(dx, dy);
      const eff = scale * BASE_VISUAL_SCALE;
      const key = draggingLabelKeyRef.current;
      const cur = labelOffsetsRef.current[key] || { dxWorld: 0, dyWorld: 0 };
      // 仅更新偏移，保留已有 leaderManual 等属性，避免拖拽导致已翻转方向丢失
      labelOffsetsRef.current[key] = {
        ...(labelOffsetsRef.current[key] || {}),
        dxWorld: (cur.dxWorld ?? 0) + dx / eff,
        dyWorld: (cur.dyWorld ?? 0) + dy / eff,
      };
      lastTouchPosRef.current = { x: cx, y: cy };
      needsRedrawRef.current = true;
      return;
    }

    if (isDragging) {
      const now = performance.now();
      const curX = e.clientX;
      const curY = e.clientY;
      const dx = curX - (dragStart.x + canvasOffset.x);
      const dy = curY - (dragStart.y + canvasOffset.y);
      movedDistanceRef.current = Math.hypot(dx, dy);
      if (!lastDragTsRef.current) {
        lastDragTsRef.current = now;
        lastDragPosRef.current = { x: curX, y: curY };
      } else {
        const dt = Math.max(1, now - lastDragTsRef.current);
        const vx = (curX - lastDragPosRef.current.x) / dt;
        const vy = (curY - lastDragPosRef.current.y) / dt;
        dragVelRef.current = { vx, vy };
        lastDragTsRef.current = now;
        lastDragPosRef.current = { x: curX, y: curY };
      }
      setCanvasOffset({ x: curX - dragStart.x, y: curY - dragStart.y });
      onSaveDebounced && onSaveDebounced();
    }
  };

  const onMouseUp = (e) => {
    e.preventDefault();
    // 结束组件/配件拖拽
    if (isResizingRoomRef.current) {
      isResizingRoomRef.current = false;
      resizingComponentRef.current = null;
      onSaveImmediate && onSaveImmediate();
    }
    if (isDraggingComponentRef.current) {
      isDraggingComponentRef.current = false;
      draggingComponentRef.current = null;
      onSaveImmediate && onSaveImmediate();
    }
    if (isDraggingFittingRef.current) {
      isDraggingFittingRef.current = false;
      draggingFittingRef.current = null;
      onSaveImmediate && onSaveImmediate();
    }
    if (isDraggingLabelRef.current) {
      isDraggingLabelRef.current = false;
      draggingLabelKeyRef.current = null;
      // 将偏移写回上层并保存
      onUpdateLabelOffsets && onUpdateLabelOffsets(labelOffsetsRef.current);
      onSaveImmediate && onSaveImmediate();
    }
    // 结束引线把手拖拽并持久化
    if (isDraggingLeaderPointRef.current) {
      isDraggingLeaderPointRef.current = false;
      draggingLeaderPointRef.current = null;
      onUpdateLabelOffsets && onUpdateLabelOffsets(labelOffsetsRef.current);
      onSaveImmediate && onSaveImmediate();
    }
    setIsDragging(false);
    // 点击选择：位移阈值内认为是点击
    const moved = movedDistanceRef.current || 0;
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? e.clientX - rect.left : e.clientX;
    const cy = rect ? e.clientY - rect.top : e.clientY;
    if (moved < 6) {
      const hit = hitTestAtCanvasPoint(cx, cy);
      const eff = scale * BASE_VISUAL_SCALE;
      const worldPoint = { x: (cx - canvasOffset.x) / eff, y: (cy - canvasOffset.y) / eff };
      // 需求3：点击拐点紫色圆点，切换水平线的绘制方向（左右互换）
      if (hit && hit.leaderHandle && hit.leaderHandle.handle === 'elbow') {
        const { key } = hit.leaderHandle;
        labelOffsetsRef.current[key] = labelOffsetsRef.current[key] || {};
        labelOffsetsRef.current[key].leaderManual = labelOffsetsRef.current[key].leaderManual || {};
        const lh = (leaderHandlesRef.current || []).find(z => z && z.key === key);
        const effLocal = scale * BASE_VISUAL_SCALE;
        // 计算世界坐标拐点与当前 end
        let elbowWorld = null;
        if (labelOffsetsRef.current[key].leaderManual && labelOffsetsRef.current[key].leaderManual.elbowWorld) {
          elbowWorld = labelOffsetsRef.current[key].leaderManual.elbowWorld;
        } else if (lh && lh.elbow) {
          elbowWorld = { x: (lh.elbow.x - canvasOffset.x) / effLocal, y: (lh.elbow.y - canvasOffset.y) / effLocal };
        }
        let prevEndWorld = null;
        if (labelOffsetsRef.current[key].leaderManual && labelOffsetsRef.current[key].leaderManual.endWorld) {
          prevEndWorld = labelOffsetsRef.current[key].leaderManual.endWorld;
        } else if (lh && lh.end) {
          prevEndWorld = { x: (lh.end.x - canvasOffset.x) / effLocal, y: (lh.end.y - canvasOffset.y) / effLocal };
        }
        if (elbowWorld) {
          // 若不存在 end，则构造一个默认长度（世界单位约 12px）
          if (!prevEndWorld) prevEndWorld = { x: elbowWorld.x + (12 / effLocal), y: elbowWorld.y };
          // 围绕拐点进行水平镜像：newEndX = 2 * elbow.x - prevEnd.x
          const newEndX = elbowWorld.x * 2 - prevEndWorld.x;
          const newEnd = { x: newEndX, y: elbowWorld.y };
          labelOffsetsRef.current[key].leaderManual.endWorld = newEnd;
          // 锁定拐点位置：点击翻转不应改变拐点
          if (!labelOffsetsRef.current[key].leaderManual.elbowWorld) {
            labelOffsetsRef.current[key].leaderManual.elbowWorld = elbowWorld;
          }
          // 同步文本水平跟随：dxWorld += (newEndX - prevEndWorld.x)
          try {
            const curOff = labelOffsetsRef.current[key] || {};
            const curDx = (curOff.dxWorld ?? curOff.dx ?? 0);
            const deltaX = newEndX - prevEndWorld.x;
            labelOffsetsRef.current[key] = { ...(labelOffsetsRef.current[key] || {}), dxWorld: curDx + deltaX };
          } catch {}
          onUpdateLabelOffsets && onUpdateLabelOffsets(labelOffsetsRef.current);
          onSaveImmediate && onSaveImmediate();
          needsRedrawRef.current = true;
          // 不改变当前选择（保持原命中结果）；但为避免双重持久化，提前返回
          return;
        }
      }
      // 默认点击选择逻辑（附带 worldPoint）
      if (hit) {
        const normalized = normalizeHit(hit);
        onSelectionChange && onSelectionChange({ ...normalized, worldPoint });
        onSaveDebounced && onSaveDebounced();
      } else {
        onSelectionChange && onSelectionChange({ segment: null, component: null, fitting: null, endpoint: null, worldPoint });
      }
    }
    // 惯性滑动（鼠标）：仅在画布拖拽结束且非点击时触发
    if (moved >= 6 && !isDraggingComponentRef.current && !isDraggingFittingRef.current && !isDraggingLabelRef.current) {
      const { vx = 0, vy = 0 } = dragVelRef.current || {};
      const speed = Math.hypot(vx, vy);
      const decayMs = 420;
      const maxDist = 600;
      const dist = Math.min(maxDist, speed * decayMs);
      const targetX = offsetRef.current.x + vx * decayMs * 0.9;
      const targetY = offsetRef.current.y + vy * decayMs * 0.9;
    animatePanTo(targetX, targetY, { duration: decayMs, ease: 'out(2)' });
    }
    movedDistanceRef.current = 0;
    lastDragTsRef.current = 0;
    lastDragPosRef.current = { x: 0, y: 0 };
    dragVelRef.current = { vx: 0, vy: 0 };
    onSaveImmediate && onSaveImmediate();
  };

  // 双击标签文字以翻转水平引线方向（左右互换），并将文本随之移动以保持相对位置
  const onDoubleClick = (e) => {
    // 已移除“双击标注文本进行翻转”的交互，保留空函数以避免潜在引用
    return;
  };

  // 禁止页面缩放与滚动（在画布上）
  useEffect(() => {
    const preventCtrlZoom = (ev) => {
      if (ev.ctrlKey) ev.preventDefault();
    };
    const preventGesture = (ev) => { ev.preventDefault(); };
    globalThis.addEventListener('wheel', preventCtrlZoom, { passive: false });
    // Safari iOS 手势缩放事件（非标准）
    globalThis.addEventListener('gesturestart', preventGesture, { passive: false });
    globalThis.addEventListener('gesturechange', preventGesture, { passive: false });
    globalThis.addEventListener('gestureend', preventGesture, { passive: false });
    return () => {
      globalThis.removeEventListener('wheel', preventCtrlZoom);
      globalThis.removeEventListener('gesturestart', preventGesture);
      globalThis.removeEventListener('gesturechange', preventGesture);
      globalThis.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  return (
    <canvas
      id={id}
      ref={canvasRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    />
  );
});

export default CanvasView;