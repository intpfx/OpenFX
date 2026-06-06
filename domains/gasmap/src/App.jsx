import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import pipelineConfig from './config/pipeline.json' with { type: "json" };
import equipmentConfig from './config/equipment.json' with { type: "json" };
import { normalizeMaterialGroup, parseDiameterNumeric, defaultScalePolicy, formatDiameterForDisplay, formatDiameterAsDN } from "./utils/pipelineSpec.js";
import scaleSettings from './config/scaleSettings.json' with { type: "json" };
import { clampPixelLength } from "./utils/scalePolicy.js";
import { ProjectProvider, useProject } from "./contexts/ProjectContext.jsx";
import { ToastProvider, useToast } from "./components/ToastProvider.jsx";
import LiveDock from "./components/LiveDock.jsx";
import CanvasView from "./components/CanvasView.jsx";
import BlockOverlay from "./components/BlockOverlay.jsx";
import AddToHomeScreen from "./components/AddToHomeScreen.jsx";
// Onboarding removed (driver.js dependency removed)
import { buildPlanViewModel } from "./utils/viewProjection.js";
import { applyWatermarkToCanvas } from "./utils/watermark.js";
import { pointDistanceToSegment, pointsEqual } from "./utils/geometry.js";
import { 
  calculateDistance, 
  calculateAngle, 
  calculateEndPoint, 
  normalizeAngleToStandard,
  detectSignificantOverlap,
  detectEndpointLandingOnSegment
} from "./utils/geometry.js";
import { calculateFittingsByConnections } from "./utils/pipelineCalculations.js";
import { 
  calculateLengthsByType, 
  calculateDevicesByType, 
  calculateFittings,
  getConnectedChain,
  computeSelectedPipelineStats
} from "./services/statistics.js";

const AppContent = () => {
  const canvasViewRef = useRef(null);
  // 从 ProjectContext 获取项目相关状态和方法
  const {
    segments, setSegments,
    components, setComponents,
    fittings, setFittings,
    manualFittings,
    designStartPoint,
    currentPoint, setCurrentPoint,
    canvasOffset, setCanvasOffset,
    scale, setScale,
    showLabels, setShowLabels,
    labelOffsetsSystem, setLabelOffsetsSystem,
    labelOffsetsPlane, setLabelOffsetsPlane,
    planComponentPositions,
    planFittingPositions,
    saveCurrentProject,
    shouldCenterOnNewProject,
    setShouldCenterOnNewProject,
    uiMode,
    insertDeviceType,
    insertOptions,
    pushHistory,
    logOperation,
    currentProject,
    licenseVersion,
    viewMode,
    setViewMode,
    updatePlanComponentPosition,
    updatePlanFittingPosition
  } = useProject();

  const { show: showToast, update: updateToast, dismiss: dismissToast } = useToast();

  // 当前项目的状态
const [distance, setDistance] = useState(6.0);
  const [selectedDirection, setSelectedDirection] = useState(0);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [selectedPipelineStats, setSelectedPipelineStats] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [selectedFitting, setSelectedFitting] = useState(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  // 由 BlockOverlay 统一检测与控制遮罩显示，App 持有其可见性以控制交互
  const [blocked, setBlocked] = useState(false);

  const planViewModel = useMemo(() => {
    if (viewMode !== 'plane') return null;
    try {
      return buildPlanViewModel({
        segments,
        components,
        fittings,
        planComponentPositions,
        planFittingPositions,
        designStartPoint
      });
    } catch (err) {
      console.error('[App] buildPlanViewModel error', err);
      return null;
    }
  }, [viewMode, segments, components, fittings, planComponentPositions, planFittingPositions, designStartPoint]);

  // 阀门与设备弹窗相关状态暂时移除

  // 与 LiveDock.jsx 的 materials/diameters 保持一致，避免索引与联动不一致（来自配置）
  const pipeMaterials = pipelineConfig.materials;
  const diameterOptionsMap = pipelineConfig.diameterOptions;
  const [selectedMaterial, setSelectedMaterial] = useState(pipeMaterials[0]);
  const [selectedDiameter, setSelectedDiameter] = useState(diameterOptionsMap[pipeMaterials[0]][1]);

// 固定传给 LiveDock 的回调引用，减少子组件重渲染
  const handleDirectionChange = useCallback((index) => {
    
    setSelectedDirection(index);
  }, []);

  const handleMaterialChange = useCallback((m) => {
    
    setSelectedMaterial(m);
    // 联动修正直径为当前材质下的有效值：保留现值若有效，否则重置为首个选项
    const opts = diameterOptionsMap[m] || diameterOptionsMap[pipeMaterials[0]];
    setSelectedDiameter(prev => (opts && opts.includes(prev)) ? prev : (opts ? opts[0] : prev));
  }, []);

  const handleDiameterChange = useCallback((d) => {
    
    setSelectedDiameter(d);
  }, []);

  // 调压箱规格与物联网表规格（来自配置）
  const regulatorTypes = equipmentConfig.regulatorTypes;
  const [selectedRegulatorType, setSelectedRegulatorType] = useState(regulatorTypes[0]);

  const meterTypes = equipmentConfig.meterTypes; // 去除 G1.6，按需求
  const [selectedMeterType, setSelectedMeterType] = useState(meterTypes[0]);

  const handleCycleMeterType = useCallback(() => {
    setSelectedMeterType(prev => {
      const idx = meterTypes.indexOf(prev);
      const nextIdx = idx >= 0 ? (idx + 1) % meterTypes.length : 0;
      return meterTypes[nextIdx];
    });
  }, [meterTypes]);

  // 与 LiveDock.jsx 保持同序，索引稳定
  const directions = [
    { angle: 0, label: '东', icon: '→' },
    { angle: 135, label: '南', icon: '↙' },
    { angle: 180, label: '西', icon: '←' },
    { angle: 315, label: '北', icon: '↗' },
    { angle: 270, label: '上', icon: '↑' },
    { angle: 90, label: '下', icon: '↓' }
  ];

  // 与 CanvasView 保持一致的基础视觉倍率（100% 缩放下）
  const VISUAL_BASE = 5;

  // 需要在方向选择时跳过的所有“已占用方向”：从当前端点指向每个连接段的另一端点的方向
  const forbiddenDirectionIndices = useMemo(() => {
    if (!currentPoint) return [];

    // 角度与索引辅助
    const toDeg = (rad) => { let d = rad * 180 / Math.PI; return d < 0 ? d + 360 : d; };
    const cyclicDiff = (a, b) => { let d = Math.abs(a - b); return d > 180 ? 360 - d : d; };
    const findNearestDirectionIdx = (deg) => {
      let bestIdx = -1; let bestDiff = Infinity;
      for (let i = 0; i < directions.length; i++) {
        const ddeg = directions[i]?.angle || 0;
        const diff = cyclicDiff(deg, ddeg);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      return bestIdx;
    };
    const findOppositeIdx = (idx) => {
      if (idx < 0) return -1;
      const target = ((directions[idx]?.angle || 0) + 180) % 360;
      return findNearestDirectionIdx(target);
    };

    const indices = [];
    const endpointDirs = new Set();
    const occupiedDirs = new Set();

    // 1) 端点方向占用：从当前端点指向每个连接段另一端点的方向
    const connected = segments.filter(s => (
      (s.startPoint && s.startPoint.x === currentPoint.x && s.startPoint.y === currentPoint.y) ||
      (s.endPoint && s.endPoint.x === currentPoint.x && s.endPoint.y === currentPoint.y)
    ));
    connected.forEach(seg => {
      const isAtEnd = seg.endPoint && seg.endPoint.x === currentPoint.x && seg.endPoint.y === currentPoint.y;
      const other = isAtEnd ? seg.startPoint : seg.endPoint;
      if (!other) return;
      const deg = toDeg(Math.atan2(other.y - currentPoint.y, other.x - currentPoint.x));
      const idx = findNearestDirectionIdx(deg);
      if (idx >= 0) {
        if (!indices.includes(idx)) indices.push(idx);
        endpointDirs.add(idx);
        occupiedDirs.add(idx);
      }
    });

    // 若当前点位已有三个方向的线（即三通满位），则完全禁用新增方向
    if (endpointDirs.size >= 3) {
      return Array.from({ length: directions.length }, (_, i) => i);
    }

    // 2) 中点占用：若当前点“在某段的中部上”，禁止该段方向及其相反方向
    // 修正：仅当当前点几乎落在管段几何线上（而非仅靠近）才视为中点命中，避免误判三通
    const MID_EPS_BASE = 0.2; // 世界坐标极小容差，约等于 ~0.05m（在 base 比例下）
    const threshold = 3; // 世界坐标阈值（仅用于端点邻近判断，与其他统计保持一致）
    segments.forEach(seg => {
      const x1 = seg.startPoint.x, y1 = seg.startPoint.y;
      const x2 = seg.endPoint.x, y2 = seg.endPoint.y;
      const dx = x2 - x1, dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq <= 0) return;
      // 点到段的投影参数 t（0-1）与几何距离
      const A = currentPoint.x - x1;
      const B = currentPoint.y - y1;
      const t0 = (A * dx + B * dy) / lenSq;
      const t = Math.max(0, Math.min(1, t0));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const d = Math.hypot(currentPoint.x - projX, currentPoint.y - projY);
      // 自适应几何容差：随段长轻微缩放，避免极短段上的数值抖动
      const segLen = Math.hypot(dx, dy);
      const MID_EPS = Math.min(0.5, Math.max(MID_EPS_BASE, segLen * 0.02));
      // 端点邻近：采用较大的统计阈值，交由“端点方向占用”处理
      const nearStart = Math.hypot(currentPoint.x - x1, currentPoint.y - y1) <= threshold;
      const nearEnd = Math.hypot(currentPoint.x - x2, currentPoint.y - y2) <= threshold;
      // 仅当：投影处在段内部且距离极小（确认为在段上），且不在端点附近，才判定为“中点占用”
      if (!nearStart && !nearEnd && t > 1e-3 && t < 1 - 1e-3 && d <= MID_EPS) {
        const deg = toDeg(Math.atan2(y2 - y1, x2 - x1));
        const idx = findNearestDirectionIdx(deg);
        const opp = findOppositeIdx(idx);
        if (idx >= 0 && !indices.includes(idx)) indices.push(idx);
        if (opp >= 0 && !indices.includes(opp)) indices.push(opp);
        if (idx >= 0) occupiedDirs.add(idx);
        if (opp >= 0) occupiedDirs.add(opp);
      }
    });

    // 若端点与中点合计占用方向达到三个（管线内段三通满位），则完全禁用
    if (occupiedDirs.size >= 3) {
      return Array.from({ length: directions.length }, (_, i) => i);
    }

    return indices;
  }, [currentPoint, segments, directions]);

  // 同步修正方向选择器：当禁用集合包含当前方向时，自动跳到下一个可用方向
  useEffect(() => {
    if (!Array.isArray(forbiddenDirectionIndices) || forbiddenDirectionIndices.length === 0) return;
    const set = new Set(forbiddenDirectionIndices);
    // 若当前方向被禁用，按按钮循环顺序跳到下一个允许方向
    if (set.has(selectedDirection)) {
      let next = (selectedDirection + 1) % directions.length;
      let attempts = 0;
      while (attempts < directions.length && set.has(next)) {
        next = (next + 1) % directions.length;
        attempts++;
      }
      // 若所有方向均被禁用，保持当前方向不变
      if (attempts < directions.length) {
        setSelectedDirection(next);
      }
    }
  }, [forbiddenDirectionIndices, selectedDirection, directions.length]);

  const saveDebouncedRef = useRef(null);
  const saveCurrentProjectDebounced = useCallback(() => {
    if (saveDebouncedRef.current) clearTimeout(saveDebouncedRef.current);
    saveDebouncedRef.current = setTimeout(() => {
      saveCurrentProject();
    }, 300);
  }, [saveCurrentProject]);

  // 新建工程首次进入时，将当前设计起点居中到画布
  useEffect(() => {
    if (!shouldCenterOnNewProject) return;
    // 通过 CanvasView 的暴露方法执行平滑居中
    const api = canvasViewRef.current;
    if (api && typeof api.centerCurrentPoint === 'function') {
      api.centerCurrentPoint();
    }
    // 重置标记，避免影响后续工程加载逻辑
    setShouldCenterOnNewProject(false);
  }, [shouldCenterOnNewProject]);

  // 原遮罩检测逻辑由 BlockOverlay 封装

  /**
   * 获取与选中段相连通的管道链（限制材质一致）
   */
  const getConnectedChain = (baseSeg) => {
    if (!baseSeg) return [];
    const sameMaterialSegments = segments.filter(s => s.material === baseSeg.material);
    const visited = new Set();
    const queue = [];
    const result = [];

    const shareEndpoint = (a, b) => {
      return pointsEqual(a.startPoint, b.startPoint) || pointsEqual(a.startPoint, b.endPoint) ||
        pointsEqual(a.endPoint, b.startPoint) || pointsEqual(a.endPoint, b.endPoint);
    };

    queue.push(baseSeg);
    visited.add(baseSeg.id);
    while (queue.length) {
      const cur = queue.shift();
      result.push(cur);
      for (const s of sameMaterialSegments) {
        if (visited.has(s.id)) continue;
        if (shareEndpoint(cur, s)) {
          visited.add(s.id);
          queue.push(s);
        }
      }
    }

    return result;
  };

  /**
   * 计算选中管道的统计信息
   */
  const computeSelectedPipelineStats = (seg) => {
    if (!seg) return null;
    const chain = getConnectedChain(seg);
    const totalLength = chain.reduce((sum, s) => sum + (s.length || 0), 0);

    // 端点集合与度数统计用于判断末端
    const degree = new Map();
    const pointKey = (p) => `${p.x},${p.y}`;
    const addDegree = (p) => degree.set(pointKey(p), (degree.get(pointKey(p)) || 0) + 1);
    chain.forEach(s => { addDegree(s.startPoint); addDegree(s.endPoint); });
    const endpoints = chain.flatMap(s => [s.startPoint, s.endPoint]).filter(p => (degree.get(pointKey(p)) || 0) === 1);

    // 计算整体网络的端点度数（不区分材质），用于判断是否“未连接的端点”
    const degreeAll = new Map();
    const addDegreeAll = (p) => degreeAll.set(pointKey(p), (degreeAll.get(pointKey(p)) || 0) + 1);
    segments.forEach(s => { addDegreeAll(s.startPoint); addDegreeAll(s.endPoint); });
    const freeEndpointsOverall = endpoints.filter(ep => (degreeAll.get(pointKey(ep)) || 0) === 1);

    // 计算当前选中管段的未连接端点数量
    const selectedSegmentFreeEndpoints = [];
    if (seg) {
      const segmentEndpoints = [seg.startPoint, seg.endPoint];
      segmentEndpoints.forEach(ep => {
        // 检查该端点在整个网络中的度数是否为1（未连接）
        if ((degreeAll.get(pointKey(ep)) || 0) === 1) {
          selectedSegmentFreeEndpoints.push(ep);
        }
      });
    }

    // 组件与配件关联判定
    const threshold = 3; // 世界坐标阈值
    // 段级命中与端点邻近判断（段级统计只统计当前选中管段上的数量）
    const isOnSelectedSegment = (x, y) => {
      return pointDistanceToSegment(
        x,
        y,
        seg.startPoint.x,
        seg.startPoint.y,
        seg.endPoint.x,
        seg.endPoint.y
      ) <= threshold;
    };
    const nearAnyEndpoint = (x, y) => endpoints.some(ep => Math.hypot(x - ep.x, y - ep.y) <= threshold);
    const isOnChain = (x, y) => {
      for (const s of chain) {
        const d = pointDistanceToSegment(x, y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
        if (d <= threshold) return true;
      }
      return false;
    };

    // 与设计起点相连的判定：链上任意端点或端点附近接近设计起点
    const nearDesignStart = (p) => Math.hypot(p.x - designStartPoint.x, p.y - designStartPoint.y) <= threshold;
    const chainConnectedToDesignStart = chain.some(s => nearDesignStart(s.startPoint) || nearDesignStart(s.endPoint));

    // 组件统计
    let copperValveCount = 0;
    let endpointCopperValveCount = 0;
    let flangeValveCount = 0;
    let endpointFlangeValveCount = 0;
    let explosionValveCount = 0;
    let meterCount = 0;
    let firstMeterSpec = null;
    let pillarCount = 0;
    let regulatorCount = 0;
    let firstRegulatorSpec = null;

    // 段级端点检测：检查是否在当前选中管段的端点附近
    const nearSelectedSegmentEndpoint = (x, y) => {
      if (!selectedSegment) return false;
      const segmentEndpoints = [selectedSegment.startPoint, selectedSegment.endPoint];
      return segmentEndpoints.some(ep => Math.hypot(x - ep.x, y - ep.y) <= threshold);
    };

    for (const c of components) {
      if (!isOnChain(c.x, c.y)) continue;
      switch (c.type) {
        case 'copperValve':
          copperValveCount += 1;
          if (nearSelectedSegmentEndpoint(c.x, c.y)) endpointCopperValveCount += 1;
          break;
        case 'flangeValve':
          flangeValveCount += 1;
          if (nearSelectedSegmentEndpoint(c.x, c.y)) endpointFlangeValveCount += 1;
          break;
        case 'explosionProofValve':
          explosionValveCount += 1;
          break;
        case 'meter':
          meterCount += 1;
          if (!firstMeterSpec) {
            firstMeterSpec = c.meterSpec || null;
          }
          break;
        case 'pillar':
          pillarCount += 1;
          break;
        case 'regulator':
          regulatorCount += 1;
          if (!firstRegulatorSpec) {
            firstRegulatorSpec = c.regulatorSpec || null;
          }
          break;
        default:
          break;
      }
    }

    // 配件统计（支架）
    let bracketCount = 0;
    for (const f of fittings) {
      if (!isOnChain(f.x, f.y)) continue;
      if (f.type === 'bracket') bracketCount += 1;
    }

    const middleCopperValves = Math.max(0, copperValveCount - endpointCopperValveCount);
    const middleFlangeValves = Math.max(0, flangeValveCount - endpointFlangeValveCount);

    const globalRegulatorInstalled = components.some(c => c.type === 'regulator');
    // 段级球阀数量统计：仅统计当前选中管段上的“中间球阀”（排除链路端点附近）
    let segmentCopperValves = 0;
    let segmentFlangeValves = 0;
    let segmentExplosionValves = 0;
    // 段级调压箱统计：仅统计当前选中管段上的调压箱
    let segmentRegulatorCount = 0;
    let segmentRegulatorSpec = null;
    // 段级物联网表统计：仅统计当前选中管段上的表
    let segmentMeterCount = 0;
    let segmentMeterSpec = null;
    for (const c of components) {
      if (!isOnSelectedSegment(c.x, c.y)) continue;
      // 段级球阀统计排除端点球阀；调压箱和物联网表不排除端点
      if (c.type === 'copperValve') {
        if (nearAnyEndpoint(c.x, c.y)) continue;
        segmentCopperValves += 1;
      } else if (c.type === 'flangeValve') {
        if (nearAnyEndpoint(c.x, c.y)) continue;
        segmentFlangeValves += 1;
      } else if (c.type === 'explosionProofValve') {
        if (nearAnyEndpoint(c.x, c.y)) continue;
        segmentExplosionValves += 1;
      } else if (c.type === 'regulator') {
        segmentRegulatorCount += 1;
        if (!segmentRegulatorSpec) segmentRegulatorSpec = c.regulatorSpec || null;
      } else if (c.type === 'meter') {
        segmentMeterCount += 1;
        if (!segmentMeterSpec) segmentMeterSpec = c.meterSpec || null;
      }
    }
    return {
      totalLength,
      endBallValveInstalled: (endpointCopperValveCount > 0) || (endpointFlangeValveCount > 0),
      freeEndpointCount: selectedSegmentFreeEndpoints.length,
      explosionValveCount,
      explosionConfigured: explosionValveCount > 0,
      iotMeterConnected: segmentMeterCount > 0,
      meterSpec: segmentMeterSpec,
      pillarCount,
      regulatorCount,
      regulatorSpec: firstRegulatorSpec,
      globalRegulatorInstalled,
      chainConnectedToDesignStart,
      bracketCount,
      middleCopperValves,
      middleFlangeValves,
      segmentCopperValves,
      segmentFlangeValves,
      segmentExplosionValves,
      segmentRegulatorCount,
      segmentRegulatorSpec,
      material: seg.material
    };
  };

  // 选中段或数据变化时，实时更新统计
  useEffect(() => {
    const stats = computeSelectedPipelineStats(selectedSegment);
    setSelectedPipelineStats(stats);
  }, [selectedSegment, segments, components, fittings]);
  /**
   * 计算不同类型管道的总长度
   * @returns {Object} 包含各类型管道长度的对象
   */
  const calculateLengthsByType = useCallback(() => {
    const lengths = {};
    segments.forEach(segment => {
      const specDisplay = formatDiameterForDisplay(segment.diameter || '', { material: segment.material });
      const key = `${segment.material}-${specDisplay}`;
      if (!lengths[key]) {
        lengths[key] = 0;
      }
      lengths[key] += segment.length;
    });

    // 将立柱的高度（米）并入对应镀锌钢管规格的长度统计
    (manualFittings || []).forEach(item => {
      const isPillar = (item.type === 'pillar') || (item.type === 'bracket' && item.subType === '立柱');
      if (!isPillar) return;
      const h = Number(item.height);
      if (!Number.isFinite(h) || h <= 0) return;
      // 规格优先使用 spec，其次 diameter，最后回退 DN15
      const rawSpec = (item.spec || item.diameter || 'DN15').trim();
      const spec = formatDiameterForDisplay(rawSpec, { material: '镀锌钢管' });
      const quantity = Math.max(1, parseInt(item.quantity) || 1);
      const key = `镀锌钢管-${spec}`;
      lengths[key] = (lengths[key] || 0) + h * quantity;
    });

    // 并入作为组件插入的立柱（components 中的 pillar）高度到对应镀锌钢管规格
    (components || []).forEach(c => {
      if (c.type !== 'pillar') return;
      const h = Number(c.height);
      if (!Number.isFinite(h) || h <= 0) return;
      const qty = Math.max(1, parseInt(c.quantity) || 1);
      const spec = formatDiameterForDisplay((c.diameter || 'DN15').trim(), { material: '镀锌钢管' });
      const key = `镀锌钢管-${spec}`;
      lengths[key] = (lengths[key] || 0) + h * qty;
    });
    return lengths;
  }, [segments, manualFittings, components, fittings]);

  /**
   * 计算不同类型配件的数量
   * @returns {Object} 包含各类型配件数量的对象
   */
  /**
   * 将材质归类到逻辑分组
   */


  /**
   * 解析直径为可比较的数值
   */


  /**
   * 计算端点连接产生的管件数量
   * 规则参考用户需求：异径管、弯头、三通、钢塑转换
   * 
   * Refactored: Core logic moved to pipelineCalculations.js
   */
  const calculateFittings = useCallback(() => {
    return calculateFittingsByConnections({
      segments,
      manualFittings,
      components,
      fittings
    });
  }, [segments, manualFittings, components, fittings]);

  /**
   * 处理距离输入变化
   * @param {Event} e - 输入事件对象
   */
  const handleDistanceChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      setDistance(value);
    }
  };

  /**
   * 增加距离
   */
  const increaseDistance = () => {
    setDistance(prevDistance => {
      const newDistance = prevDistance + 0.1;
      return Math.round(newDistance * 10) / 10;
    });
  };

  /**
   * 减少距离
   */
  const decreaseDistance = () => {
    setDistance(prevDistance => {
      const newDistance = prevDistance - 0.1;
      return newDistance > 0 ? Math.round(newDistance * 10) / 10 : prevDistance;
    });
  };

  // 防止浏览器缩放
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // 绘制管道
  useEffect(() => { 
    // TODO: 绘制管道逻辑占位，待接入 Canvas 渲染管线
  }, []);

  // 当管道段发生变化时，更新配件
  useEffect(() => {
    // 更新配件位置等逻辑
  }, [segments]);

  // 按材质的默认长度（米）：用于段的逻辑长度属性（来自配置）
  const materialLengthDefaults = pipelineConfig.defaultLength;

  const getDefaultLengthForMaterial = (m) => materialLengthDefaults[m] ?? 5.0;

  // 将“米长度”转换为世界长度，并在 100% 缩放下按像素范围裁剪
  // - 目标：无需校准；用户点击绘制时，像素长度在 100% 基准下已确定
  const metersToWorldWithClamp = useCallback((meters) => {
    const policy = currentProject?.config?.scalePolicy || defaultScalePolicy;
    const pxPerMeterBase = Number(policy?.pxPerMeterBase) || Number(scaleSettings?.pxPerMeterBase) || 48;
    // 确保线段最小像素长度至少能容纳一个球阀的沿线占位宽度
    // 参考 Canvas 绘制：铜球阀/电磁阀约 24px，法兰球阀约 30px（100% 缩放基准）
    // 使用配置中的 minValvePxBase 以便通过 JSON 调整
    const MIN_VALVE_PX_BASE = Number(scaleSettings?.minValvePxBase) || 24;
    const configuredMin = Number(policy?.minSegmentPx) || Number(scaleSettings?.minSegmentPx) || 24;
    const minPx = Math.max(configuredMin, MIN_VALVE_PX_BASE);
    const maxPx = Number(policy?.maxSegmentPx) || 480;
    // 以 100% 缩放为基准，把米长度映射到像素并裁剪
    const pxWanted = Math.abs(Number(meters) || 0) * pxPerMeterBase;
    const { clamped } = clampPixelLength(pxWanted, minPx, maxPx);
    // 回推世界长度（100% 缩放下）与对应的“米长度”（保持 length 与几何一致）
    const worldLen = clamped / VISUAL_BASE;
    const metersUsed = clamped / pxPerMeterBase;
    return { worldLen, metersUsed, pxLen: clamped };
  }, [currentProject]);

  /**
   * 将角度标准化到最接近的工程标准角度
   * 标准角度：0°, 30°, 45°, 60°, 90°, 120°, 135°, 150°, 180°等
   * @param {number} angle - 原始角度（弧度）
   * @returns {number} 标准化后的角度（弧度）
   */

  /**
   * 创建新的管道段
   */
  const createNewSegment = useCallback(() => {
    if (!currentPoint) return;
    // 限制：端点最多连接三段
    const connectedCount = segments.filter(s => (
      (s.startPoint.x === currentPoint.x && s.startPoint.y === currentPoint.y) ||
      (s.endPoint.x === currentPoint.x && s.endPoint.y === currentPoint.y)
    )).length;
    if (connectedCount >= 3) {
      
      return;
    }

    // selectedDirection 采用索引，基于 directions 映射角度
    const angleDeg = directions[selectedDirection]?.angle || 0;
    const angle = angleDeg * Math.PI / 180;
    // 距离按 100% 基准像素约束转换为世界长度
    const { worldLen } = metersToWorldWithClamp(distance);
    // 仅用于几何计算；不回写滚轮，保持用户输入的米数
    const endPoint = calculateEndPoint(currentPoint, angle, worldLen);

    const candidateSegment = {
      id: Date.now().toString(),
      startPoint: { ...currentPoint },
      endPoint,
      material: selectedMaterial,
      diameter: selectedDiameter,
      length: Number(distance),
      geoLength: calculateDistance(currentPoint, endPoint)
    };

    const overlapped = detectSignificantOverlap(candidateSegment, segments);
    if (overlapped) {
      if (typeof showToast === 'function') {
        showToast({
          type: 'warning',
          title: '无法绘制管线',
          message: '新建管线会与已有管线大面积重叠，已取消本次绘制。',
          duration: 3200,
          manualClose: true
        });
      } else {
        alert('新建管线会与已有管线大面积重叠，已取消本次绘制。');
      }
      
      if (typeof logOperation === 'function') {
        logOperation('draw_blocked_overlap', {
          candidate: candidateSegment,
          existingSegmentId: overlapped?.id || null
        });
      }
      return;
    }

    const endpointConflict = detectEndpointLandingOnSegment(endPoint, currentPoint, segments);
    if (endpointConflict) {
      if (typeof showToast === 'function') {
        showToast({
          type: 'warning',
          title: '无法绘制管线',
          message: '终点落在已有管线中部，已取消本次绘制。',
          duration: 3200,
          manualClose: true
        });
      } else {
        alert('终点落在已有管线中部，已取消本次绘制。');
      }
      
      if (typeof logOperation === 'function') {
        logOperation('draw_blocked_endpoint_touch', {
          candidate: candidateSegment,
          conflictSegmentId: endpointConflict?.id || null
        });
      }
      return;
    }

    // 推入历史快照，支持撤销创建
    pushHistory('draw:create');

    const newSegment = candidateSegment;

    // 与上一段在当前端点直通且同材质/同管径：在连接处插入“活接”（若该点非三通）
    const lastSegCreate = segments[segments.length - 1];
    if (lastSegCreate) {
      const coincidentWithEnd = lastSegCreate.endPoint.x === currentPoint.x && lastSegCreate.endPoint.y === currentPoint.y;
      const coincidentWithStart = lastSegCreate.startPoint.x === currentPoint.x && lastSegCreate.startPoint.y === currentPoint.y;
      const prevAngle = calculateAngle(lastSegCreate.startPoint, lastSegCreate.endPoint);
      const reverseAngle = calculateAngle(lastSegCreate.endPoint, lastSegCreate.startPoint);
      const expectedAngle = coincidentWithEnd ? prevAngle : (coincidentWithStart ? reverseAngle : null);
      const normalizeAng = (a) => {
        const TWO_PI = Math.PI * 2;
        let r = a % TWO_PI;
        if (r < 0) r += TWO_PI;
        return r;
      };
      const angleClose = expectedAngle == null ? false : (() => {
        const diff = Math.abs(normalizeAng(expectedAngle) - normalizeAng(angle));
        const altDiff = Math.abs(diff - Math.PI * 2);
        return diff < 1e-6 || altDiff < 1e-6;
      })();
      const sameMaterial = lastSegCreate.material === selectedMaterial;
      const sameDiameter = lastSegCreate.diameter === selectedDiameter;
      // 若当前点已存在其他连接（将成为三通），不插入活接
      const willBeTee = connectedCount >= 2;
      if ((coincidentWithEnd || coincidentWithStart) && sameMaterial && sameDiameter && angleClose && !willBeTee) {
        addFitting('union');
      }
    }

    setSegments(prev => [...prev, newSegment]);
    setCurrentPoint(endPoint);
    
    // 使用防抖保存以确保最新的 segments 已应用
    if (typeof saveCurrentProjectDebounced === 'function') {
      saveCurrentProjectDebounced();
    } else {
      saveCurrentProject();
    }
  }, [currentPoint, selectedDirection, selectedMaterial, selectedDiameter, distance, segments, metersToWorldWithClamp, showToast, logOperation, pushHistory, saveCurrentProject, saveCurrentProjectDebounced]);

  /**
   * 延长当前管道段
   */
  const extendCurrentSegment = useCallback(() => {
    if (!currentPoint || segments.length === 0) return;
    // 限制：端点最多连接三段
    const connectedCount = segments.filter(s => (
      (s.startPoint.x === currentPoint.x && s.startPoint.y === currentPoint.y) ||
      (s.endPoint.x === currentPoint.x && s.endPoint.y === currentPoint.y)
    )).length;
    if (connectedCount >= 3) {
      
      return;
    }

  // 改为使用 Bottom 当前选择的方向角度，保持与用户选择一致
    const angleDeg = directions[selectedDirection]?.angle || 0;
    const angle = angleDeg * Math.PI / 180;
    // 距离按 100% 基准像素约束转换为世界长度
    const { worldLen } = metersToWorldWithClamp(distance);
    // 仅用于几何计算；不回写滚轮，保持用户输入的米数
    const endPoint = calculateEndPoint(currentPoint, angle, worldLen);
    const lastSeg = segments[segments.length - 1];

    const candidateSegment = {
      id: Date.now().toString(),
      startPoint: { ...currentPoint },
      endPoint,
      material: selectedMaterial,
      diameter: selectedDiameter,
      length: Number(distance),
      geoLength: calculateDistance(currentPoint, endPoint)
    };

    const overlapped = detectSignificantOverlap(candidateSegment, segments);
    if (overlapped) {
      if (typeof showToast === 'function') {
        showToast({
          type: 'warning',
          title: '无法延长管线',
          message: '延长后的管线会与已有管线大面积重叠，已取消操作。',
          duration: 3200,
          manualClose: true
        });
      } else {
        alert('延长后的管线会与已有管线大面积重叠，已取消操作。');
      }
      
      if (typeof logOperation === 'function') {
        logOperation('draw_blocked_overlap', {
          candidate: candidateSegment,
          existingSegmentId: overlapped?.id || null,
          mode: 'extend'
        });
      }
      return;
    }

    const endpointConflict = detectEndpointLandingOnSegment(endPoint, currentPoint, segments);
    if (endpointConflict) {
      if (typeof showToast === 'function') {
        showToast({
          type: 'warning',
          title: '无法延长管线',
          message: '终点落在已有管线中部，已取消操作。',
          duration: 3200,
          manualClose: true
        });
      } else {
        alert('终点落在已有管线中部，已取消操作。');
      }
      
      if (typeof logOperation === 'function') {
        logOperation('draw_blocked_endpoint_touch', {
          candidate: candidateSegment,
          conflictSegmentId: endpointConflict?.id || null,
          mode: 'extend'
        });
      }
      return;
    }

    // 推入历史快照，支持撤销延长
    pushHistory('draw:extend');
    // 比较方向、材质、管径是否与上一个管段一致
    const sameMaterial = lastSeg?.material === selectedMaterial;
    const sameDiameter = lastSeg?.diameter === selectedDiameter;
    const prevAngle = lastSeg ? calculateAngle(lastSeg.startPoint, lastSeg.endPoint) : 0;
    const normalize = (a) => {
      const TWO_PI = Math.PI * 2;
      let r = a % TWO_PI;
      if (r < 0) r += TWO_PI;
      return r;
    };
    // 取消“延长合并”，统一改为新建段并在直通连接处插入“活接”

    // 默认：新增一段，始终使用用户当前选择的材质与直径
    const useMaterial = selectedMaterial;
    const useDiameter = selectedDiameter;
    const newSegment = { ...candidateSegment, material: useMaterial, diameter: useDiameter };

    // 与上一段直通同材质/同管径：在连接处插入“活接”
    if (lastSeg) {
      const coincidentWithEnd = lastSeg.endPoint.x === currentPoint.x && lastSeg.endPoint.y === currentPoint.y;
      const coincidentWithStart = lastSeg.startPoint.x === currentPoint.x && lastSeg.startPoint.y === currentPoint.y;
      const prevAngleLocal = calculateAngle(lastSeg.startPoint, lastSeg.endPoint);
      const reverseAngleLocal = calculateAngle(lastSeg.endPoint, lastSeg.startPoint);
      const expectedAngle = coincidentWithEnd ? prevAngleLocal : (coincidentWithStart ? reverseAngleLocal : null);
      const normalizeAng = (a) => {
        const TWO_PI = Math.PI * 2;
        let r = a % TWO_PI;
        if (r < 0) r += TWO_PI;
        return r;
      };
      const angleCloseLocal = expectedAngle == null ? false : (() => {
        const diff = Math.abs(normalizeAng(expectedAngle) - normalizeAng(angle));
        const altDiff = Math.abs(diff - Math.PI * 2);
        return diff < 1e-6 || altDiff < 1e-6;
      })();
      const sameMaterialLocal = lastSeg.material === useMaterial;
      const sameDiameterLocal = lastSeg.diameter === useDiameter;
      // 若当前点已有其它连接（该次操作将构成三通），不插入活接
      const connectedCountHere = segments.filter(s => (
        (s.startPoint.x === currentPoint.x && s.startPoint.y === currentPoint.y) ||
        (s.endPoint.x === currentPoint.x && s.endPoint.y === currentPoint.y)
      )).length;
      const willBeTeeLocal = connectedCountHere >= 2;
      if ((coincidentWithEnd || coincidentWithStart) && sameMaterialLocal && sameDiameterLocal && angleCloseLocal && !willBeTeeLocal) {
        addFitting('union');
      }
    }

    setSegments(prev => [...prev, newSegment]);
    setCurrentPoint(endPoint);
    
    // 使用防抖保存以确保最新的 segments 已应用
    if (typeof saveCurrentProjectDebounced === 'function') {
      saveCurrentProjectDebounced();
    } else {
      saveCurrentProject();
    }
  }, [currentPoint, segments, distance, selectedDirection, selectedMaterial, selectedDiameter, metersToWorldWithClamp, showToast, logOperation, pushHistory, saveCurrentProject, saveCurrentProjectDebounced]);

  // 更新选中管段属性（双向绑定）：支持嵌套端点与基本属性，自动重算长度
  const updateSelectedSegment = useCallback((patchOrUpdater) => {
    if (!selectedSegment) return;

    // 推入历史快照，支持撤销更新
    pushHistory('draw:update');
    let updatedSegForSelection = null;
    setSegments(prev => {
      const nextList = prev.map(seg => {
        if (seg.id !== selectedSegment.id) return seg;
        const base = seg;
        const next = typeof patchOrUpdater === 'function' ? patchOrUpdater(base) : { ...base, ...patchOrUpdater };
        const sx = (next.startPoint && typeof next.startPoint.x === 'number') ? next.startPoint.x : base.startPoint.x;
        const sy = (next.startPoint && typeof next.startPoint.y === 'number') ? next.startPoint.y : base.startPoint.y;
        const ex = (next.endPoint && typeof next.endPoint.x === 'number') ? next.endPoint.x : base.endPoint.x;
        const ey = (next.endPoint && typeof next.endPoint.y === 'number') ? next.endPoint.y : base.endPoint.y;
        const startPoint = { x: sx, y: sy };
        const endPoint = { x: ex, y: ey };
        const geoLength = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
        // 不覆盖属性 length（用户可设定），仅更新几何长度 geoLength
        const merged = { ...base, ...next, startPoint, endPoint, geoLength };
        updatedSegForSelection = merged;
        return merged;
      });
      return nextList;
    });
    // 同步选中项以维持两端绑定一致
    if (updatedSegForSelection) {
      setSelectedSegment(updatedSegForSelection);
 
    }
    // 保存（防抖）
    if (typeof saveCurrentProjectDebounced === 'function') {
      saveCurrentProjectDebounced();
    } else {
      saveCurrentProject && saveCurrentProject();
    }
  }, [selectedSegment, setSegments, setSelectedSegment, saveCurrentProjectDebounced, saveCurrentProject]);

  /**
   * 原子性提交段属性与链上阀门数量更新。
* Parent 提供此函数以避免 Bottom 在本地延迟提交造成的失效。
   * @param {Object} payload - 传给 updateSelectedSegment 的补丁 { material, diameter, length }
   * @param {Array<{type:string,count:number}>} pendings - 需要设置的阀门数量
   */
  const commitSegmentEdits = useCallback((payload, pendings) => {
    if (!selectedSegment) return;

    // 推入历史快照，支持撤销段编辑提交
    pushHistory('draw:commit');
    // 构造更新后的段，并在长度发生变化时同步更新几何端点与几何长度
    let updatedSeg = { ...selectedSegment, ...payload };
    const lengthChanged = typeof payload?.length === 'number' && payload.length !== selectedSegment.length;
    if (lengthChanged) {
      const angle = calculateAngle(selectedSegment.startPoint, selectedSegment.endPoint);
      const { worldLen } = metersToWorldWithClamp(payload.length);
      const oldEnd = { ...selectedSegment.endPoint };
      const newEnd = calculateEndPoint(selectedSegment.startPoint, angle, worldLen);
      updatedSeg = {
        ...updatedSeg,
        endPoint: newEnd,
        geoLength: calculateDistance(selectedSegment.startPoint, newEnd)
      };
      // 计算位移向量（保持相对位置关系的统一平移）
      const deltaX = newEnd.x - oldEnd.x;
      const deltaY = newEnd.y - oldEnd.y;

      // 局部工具：近点判断与点到段投影
      const NODE_EPS = 3;
      const nearPointLocal = (p, q, eps = NODE_EPS) => Math.hypot(p.x - q.x, p.y - q.y) <= eps;
      const projectPointToSegmentLocal = (px, py, x1, y1, x2, y2) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx === 0 && dy === 0) return { x: x1, y: y1 };
        const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
        const tt = Math.max(0, Math.min(1, t));
        return { x: x1 + tt * dx, y: y1 + tt * dy };
      };
      const isEndpointAnchoredToSegmentInterior = (pt, segOld) => {
        // 端点到旧几何的距离足够近，且投影不靠近两端点，视为有相对位置关系
        const d = pointDistanceToSegment(pt.x, pt.y, segOld.startPoint.x, segOld.startPoint.y, segOld.endPoint.x, segOld.endPoint.y);
        if (d > NODE_EPS) return false;
        const P = projectPointToSegmentLocal(pt.x, pt.y, segOld.startPoint.x, segOld.startPoint.y, segOld.endPoint.x, segOld.endPoint.y);
        if (nearPointLocal(P, segOld.startPoint) || nearPointLocal(P, segOld.endPoint)) return false;
        return true;
      };
      const isRelativeToSelected = (seg) => {
        // 1) 共享旧终点；或 2) 任一端点投影在当前段中部
        const shareOldEnd = nearPointLocal(seg.startPoint, oldEnd) || nearPointLocal(seg.endPoint, oldEnd);
        const interiorAnchor = isEndpointAnchoredToSegmentInterior(seg.startPoint, selectedSegment) || isEndpointAnchoredToSegmentInterior(seg.endPoint, selectedSegment);
        return shareOldEnd || interiorAnchor;
      };

      // 计算“后续管线”集合：从旧终点出发，按端点连通进行 BFS，传播到所有下游管段
      const downstreamIds = new Set();
      const visitedIds = new Set();
      const queuePts = [oldEnd];
      while (queuePts.length) {
        const pivot = queuePts.shift();
        for (const s of segments) {
          if (s.id === selectedSegment.id) continue;
          if (visitedIds.has(s.id)) continue;
          const atStart = nearPointLocal(s.startPoint, pivot);
          const atEnd = nearPointLocal(s.endPoint, pivot);
          if (atStart || atEnd) {
            visitedIds.add(s.id);
            downstreamIds.add(s.id);
            const other = atStart ? s.endPoint : s.startPoint;
            queuePts.push(other);
          }
        }
      }

      // 补充：中段锚定的分支也纳入统一平移集合
      const interiorIds = new Set();
      for (const s of segments) {
        if (s.id === selectedSegment.id) continue;
        if (isEndpointAnchoredToSegmentInterior(s.startPoint, selectedSegment) || isEndpointAnchoredToSegmentInterior(s.endPoint, selectedSegment)) {
          interiorIds.add(s.id);
        }
      }
      const translateIds = new Set([...downstreamIds, ...interiorIds]);

      // 先写入当前段，再对需要平移的管段进行统一平移（保持相对位置不变）
      let prelim = segments.map(s => (s.id === selectedSegment.id ? updatedSeg : s));
      prelim = prelim.map(s => {
        if (s.id === selectedSegment.id) return s;
        if (!translateIds.has(s.id)) return s;
        const ns = {
          ...s,
          startPoint: { x: s.startPoint.x + deltaX, y: s.startPoint.y + deltaY },
          endPoint: { x: s.endPoint.x + deltaX, y: s.endPoint.y + deltaY }
        };
        ns.geoLength = calculateDistance(ns.startPoint, ns.endPoint);
        return ns;
      });
      var newSegments = prelim;
    } else {
      // 无长度变化：只更新基本属性
      var newSegments = segments.map(s => (s.id === selectedSegment.id ? updatedSeg : s));
    }

    // 变更检测：若材质或直径发生变化，则需清空当前管段上的所有配置
    const materialChanged = (typeof payload?.material !== 'undefined') && (payload.material !== selectedSegment.material);
    const diameterChanged = (typeof payload?.diameter !== 'undefined') && (payload.diameter !== selectedSegment.diameter);
    const needResetSegmentConfigs = !!(materialChanged || diameterChanged);

    // Helper: share endpoint detection and geometry utilities
    const pointKey = (p) => `${p.x},${p.y}`;

    // Compute connected chain from updated segments (material must match)
    const getChainFrom = (baseSeg, segList) => {
      if (!baseSeg) return [];
      const sameMaterialSegments = segList.filter(s => s.material === baseSeg.material);
      const visited = new Set();
      const queue = [];
      const result = [];
      const shareEndpoint = (a, b) => {
        return pointsEqual(a.startPoint, b.startPoint) || pointsEqual(a.startPoint, b.endPoint) ||
          pointsEqual(a.endPoint, b.startPoint) || pointsEqual(a.endPoint, b.endPoint);
      };
      queue.push(baseSeg);
      visited.add(baseSeg.id);
      while (queue.length) {
        const cur = queue.shift();
        result.push(cur);
        for (const s of sameMaterialSegments) {
          if (visited.has(s.id)) continue;
          if (shareEndpoint(cur, s)) {
            visited.add(s.id);
            queue.push(s);
          }
        }
      }
      return result;
    };

    const chain = getChainFrom(updatedSeg, newSegments);

    // 改为段级提交：仅统计与布置当前选中管段上的中间球阀
    const threshold = 3;
    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    // 仅判断点是否在当前段上
    const isOnSelectedSegment = (x, y) => {
      const s = updatedSeg;
      const d = pointDistanceToSegment(x, y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
      return d <= threshold;
    };
    // 当前段端点邻近判断：用于过滤端点阀
    const nearSegEndpoints = (x, y) => {
      const s = updatedSeg;
      const segLen = dist(s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
      const placeThreshold = Math.min(3, Math.max(1, segLen * 0.1));
      const dStart = dist(x, y, s.startPoint.x, s.startPoint.y);
      const dEnd = dist(x, y, s.endPoint.x, s.endPoint.y);
      return (dStart <= placeThreshold) || (dEnd <= placeThreshold);
    };

    // collect and optionally reset current segment configurations
    const curComponents = components.slice();
    let nextComponents = curComponents.slice();
    let nextFittings = fittings.slice();

    if (needResetSegmentConfigs) {
      // 清空当前管段上的所有组件与配件（包括端点附近与中间的元素）
      nextComponents = nextComponents.filter(c => !isOnSelectedSegment(c.x, c.y));
      nextFittings = nextFittings.filter(f => !isOnSelectedSegment(f.x, f.y));
    }

    // For each pending (type,count), adjust nextComponents accordingly
    pendings && pendings.forEach(p => {
      if (!p || !p.type) return;
      const type = p.type;
      const want = Math.max(0, Math.floor(Number(p.count)) || 0);
      const currentMiddle = nextComponents.filter(c => c.type === type && isOnSelectedSegment(c.x, c.y) && !nearSegEndpoints(c.x, c.y));
      const curCount = currentMiddle.length;
      if (want === curCount) return;
      // 获取当前管段上的现有设备（用于重叠检测）
      const existingDevicesOnSegment = nextComponents.filter(c => isOnSelectedSegment(c.x, c.y));
      
      // 优先使用优化的位置计算（带重叠检测）
      let placements = calculateOptimizedPlacements([updatedSeg], type, existingDevicesOnSegment, want);
      
      // 如果空间完全不足（placements为空），尝试自动延长管线
      if (placements.length === 0 && want > 0) {
        // 计算所需的延长长度
        const deviceSpacing = 48; // 与calculateOptimizedPlacements中的间距保持一致
        const requiredLength = want * deviceSpacing;
        const currentLength = Math.hypot(
          updatedSeg.endPoint.x - updatedSeg.startPoint.x,
          updatedSeg.endPoint.y - updatedSeg.startPoint.y
        );
        const extensionNeeded = requiredLength - currentLength;
        
        if (extensionNeeded > 0) {
          // 计算延长方向（从起点到终点的方向）
          const dx = updatedSeg.endPoint.x - updatedSeg.startPoint.x;
          const dy = updatedSeg.endPoint.y - updatedSeg.startPoint.y;
          const length = Math.hypot(dx, dy);
          const unitX = dx / length;
          const unitY = dy / length;
          
          // 延长终点
          const newEndPoint = {
            x: updatedSeg.endPoint.x + unitX * extensionNeeded,
            y: updatedSeg.endPoint.y + unitY * extensionNeeded
          };
          
          // 更新管段
          const extendedSeg = { ...updatedSeg, endPoint: newEndPoint };
          
          // 重新计算位置
          placements = calculateOptimizedPlacements([extendedSeg], type, existingDevicesOnSegment, want);
          
          if (placements.length > 0) {
            // 更新segments状态中的对应管段
            const newSegments = segments.map(s => (s.id === selectedSegment.id ? extendedSeg : s));
            setSegments(newSegments);
            
            // 更新updatedSeg以便后续使用
            Object.assign(updatedSeg, extendedSeg);
          }
        }
      }
      
      // 如果优化计算不足，回退到原始方法
      if (placements.length < want) {
        const fallbackPlacements = [];
        const fractions = [0.5, 0.25, 0.75, 1/3, 2/3];
        {
          const s = updatedSeg;
          for (const frac of fractions) {
            const x = s.startPoint.x + (s.endPoint.x - s.startPoint.x) * frac;
            const y = s.startPoint.y + (s.endPoint.y - s.startPoint.y) * frac;
            if (nearSegEndpoints(x, y)) continue;
            
            // 检查是否与现有设备重叠
            if (!checkPositionOverlap(x, y, type, existingDevicesOnSegment)) {
              fallbackPlacements.push({ x, y, diameter: s.diameter });
            }
            if (fallbackPlacements.length >= want) break;
          }
        }
        
        // 如果仍然不足，使用中点位置（不做重叠检查）
        if (fallbackPlacements.length === 0 && want > 0) {
          const s = updatedSeg;
          const x = (s.startPoint.x + s.endPoint.x) / 2;
          const y = (s.startPoint.y + s.endPoint.y) / 2;
          fallbackPlacements.push({ x, y, diameter: s.diameter });
        }
        
        placements = fallbackPlacements;
      }

      if (want > curCount) {
        const toAdd = want - curCount;
        for (let i = 0; i < toAdd; i++) {
          const ppos = placements.length ? (placements[i % placements.length] || placements[placements.length - 1]) : null;
          if (!ppos) break;
          nextComponents.push({ id: Date.now().toString() + '-' + type + '-' + i, type, x: ppos.x, y: ppos.y, diameter: ppos.diameter });
      }
      } else {
        const toRemove = curCount - want;
        const idsToRemove = currentMiddle.slice(-toRemove).map(c => c.id);
        nextComponents = nextComponents.filter(c => !(c.type === type && idsToRemove.includes(c.id)));
      }
    });

    // apply state updates synchronously (React will batch)
// 同步选中段，确保 Bottom 属性面板立即显示最新值
    setSelectedSegment(updatedSeg);
    setSegments(newSegments);
    setComponents(nextComponents);
    setFittings(nextFittings);
    // persist
    saveCurrentProject();
  }, [selectedSegment, segments, components, fittings, setSelectedSegment, setSegments, setComponents, setFittings, saveCurrentProject]);

  /**
   * 添加组件到指定坐标
   * @param {string} type - 组件类型
   * @param {number} x
   * @param {number} y
   * @param {object} extras - 额外属性，如 meterSpec/regulatorSpec/segmentId
   */
  const addComponentAtPoint = (type, x, y, extras = {}) => {
    if (type === 'room') {
      const {
        w: rawWidth,
        h: rawHeight,
        wall: rawWall,
        ...restExtras
      } = extras || {};
      const width = Number.isFinite(Number(rawWidth)) ? Number(rawWidth) : 80;
      const height = Number.isFinite(Number(rawHeight)) ? Number(rawHeight) : 60;
      const wall = Number.isFinite(Number(rawWall)) ? Number(rawWall) : 6;
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      const newRoom = {
        id: Date.now().toString(),
        type,
        x: centerX,
        y: centerY,
        w: width,
        h: height,
        wall,
        ...restExtras,
      };
      setComponents(prev => [...(prev || []), newRoom]);
      saveCurrentProject();
      return;
    }

    const newComponent = {
      id: Date.now().toString(),
      type,
      x,
      y,
      diameter: selectedDiameter,
      ...extras,
    };
    setComponents(prev => [...(prev || []), newComponent]);
    saveCurrentProject();
  };

  /**
   * 添加组件（使用当前点）
   * @param {string} type - 组件类型
   */
  const addComponent = (type) => {
    if (!currentPoint) return;
    const extras =
      type === 'meter' ? { meterSpec: selectedMeterType } :
      type === 'regulator' ? { regulatorSpec: selectedRegulatorType } :
      {};
    addComponentAtPoint(type, currentPoint.x, currentPoint.y, extras);
  };

  // —— 房间墙体辅助：限制“窗”插入/移动到墙体 ——
  const getRoomDims = useCallback((room) => {
    const w = room?.w || 80;
    const h = room?.h || 60;
    const wall = Math.max(1, room?.wall || 6);
    return { w, h, wall, hx: w / 2, hy: h / 2 };
  }, []);

  const clampPointToRoomWall = useCallback((x, y, room) => {
    const { w, h, wall, hx, hy } = getRoomDims(room);
    if (w <= 2 * wall || h <= 2 * wall) return null;
    const cx = room.x, cy = room.y;
    // 外边界（用于侧别判定）
    const topYOuter = cy + hy, bottomYOuter = cy - hy, leftXOuter = cx - hx, rightXOuter = cx + hx;
    const dt = Math.abs(y - topYOuter);
    const db = Math.abs(y - bottomYOuter);
    const dl = Math.abs(x - leftXOuter);
    const dr = Math.abs(x - rightXOuter);
    const min = Math.min(dt, db, dl, dr);
    // 内壁中心线范围（用于位置与 t）
    const innerLeftX = cx - hx + wall / 2;
    const innerRightX = cx + hx - wall / 2;
    const innerBottomY = cy - hy + wall / 2;
    const innerTopY = cy + hy - wall / 2;
    if (min === dt) {
      const ny = innerTopY;
      const nx = Math.max(innerLeftX, Math.min(innerRightX, x));
      const L = Math.max(1e-6, innerRightX - innerLeftX);
      const t = (nx - innerLeftX) / L;
      return { x: nx, y: ny, side: 'top', t };
    } else if (min === db) {
      const ny = innerBottomY;
      const nx = Math.max(innerLeftX, Math.min(innerRightX, x));
      const L = Math.max(1e-6, innerRightX - innerLeftX);
      const t = (nx - innerLeftX) / L;
      return { x: nx, y: ny, side: 'bottom', t };
    } else if (min === dl) {
      const nx = innerLeftX;
      const ny = Math.max(innerBottomY, Math.min(innerTopY, y));
      const L = Math.max(1e-6, innerTopY - innerBottomY);
      const t = (ny - innerBottomY) / L;
      return { x: nx, y: ny, side: 'left', t };
    } else {
      const nx = innerRightX;
      const ny = Math.max(innerBottomY, Math.min(innerTopY, y));
      const L = Math.max(1e-6, innerTopY - innerBottomY);
      const t = (ny - innerBottomY) / L;
      return { x: nx, y: ny, side: 'right', t };
    }
  }, [getRoomDims]);

  const findNearestRoom = useCallback((x, y) => {
    let best = null, bestDist = Infinity;
    for (const c of components) {
      if (c?.type !== 'room') continue;
      const { hx, hy } = getRoomDims(c);
      const cx = c.x, cy = c.y;
      const dx = Math.max(Math.abs(x - cx) - hx, 0);
      const dy = Math.max(Math.abs(y - cy) - hy, 0);
      const d = Math.hypot(dx, dy);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }, [components, getRoomDims]);

  // —— 兼容性迁移：为缺少 roomId/wallSide/wallPos 的窗补齐参数并重算位置 ——
  useEffect(() => {
    // 仅在工程切换或初次挂载后尝试一次性修复
    setComponents(prev => {
      let changed = false;
      const next = (prev || []).map(c => {
        if (!c || c.type !== 'window') return c;
        const hasParam = c.roomId && c.wallSide && (typeof c.wallPos === 'number');
        if (hasParam) return c;
        const room = findNearestRoom(c.x, c.y);
        if (!room) return c;
        const clamped = clampPointToRoomWall(c.x, c.y, room);
        if (!clamped) return c;
        changed = true;
        return { ...c, x: clamped.x, y: clamped.y, roomId: room.id, wallSide: clamped.side, wallPos: clamped.t };
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject]);

  /**
   * 添加配件
   * @param {string} type - 配件类型
   */
  const addFitting = (type) => {
    if (!currentPoint) return;

    const newFitting = {
      id: Date.now().toString(),
      type,
      x: currentPoint.x,
      y: currentPoint.y,
      diameter: selectedDiameter
    };
    // 坐标去重：同一点仅允许存在一个同类型管件
    const exists = fittings.some(f => f.type === newFitting.type && f.x === newFitting.x && f.y === newFitting.y);
    if (exists) return;
    setFittings([...fittings, newFitting]);
    saveCurrentProject();
  };

  // 扩展：支持传入额外属性的 addFitting
  const addFittingWithExtras = useCallback((type, extras = {}) => {
    const { x: overrideX, y: overrideY, diameter: overrideDiameter, ...rest } = extras || {};
    const baseX = overrideX != null ? overrideX : currentPoint?.x;
    const baseY = overrideY != null ? overrideY : currentPoint?.y;
    if (baseX == null || baseY == null) return;
    const base = {
      id: Date.now().toString(),
      type,
      x: baseX,
      y: baseY,
      diameter: overrideDiameter != null ? overrideDiameter : selectedDiameter,
      ...rest
    };
    // 坐标去重：同一点同类型仅允许存在一个
    const exists = fittings.some(f => f.type === base.type && f.x === base.x && f.y === base.y);
    if (exists) return;
    setFittings(prev => [...prev, base]);
    saveCurrentProject();
  }, [currentPoint, selectedDiameter, fittings, saveCurrentProject]);

  /**
   * 删除选中的元素
   */
  const deleteSelected = useCallback(() => {
    if (selectedSegment) {
      setSegments(segments.filter(s => s !== selectedSegment));
      setSelectedSegment(null);
    }
    if (selectedComponent) {
      setComponents(components.filter(c => c !== selectedComponent));
      setSelectedComponent(null);
    }
    if (selectedFitting) {
      setFittings(fittings.filter(f => f !== selectedFitting));
      setSelectedFitting(null);
    }
    saveCurrentProject();
  }, [selectedSegment, selectedComponent, selectedFitting, segments, components, fittings, saveCurrentProject]);

  /**
   * 切换标签显示
   */
  const toggleLabels = useCallback(() => {
    setShowLabels(prev => !prev);
    saveCurrentProject();
  }, []);

  // 设备尺寸配置
  const getDeviceSize = useCallback((type) => {
    const baseSizes = {
      copperValve: { width: 24, height: 12 },
      flangeValve: { width: 30, height: 18 }, // 包含法兰面
      explosionProofValve: { width: 28, height: 16 }, // 包含方形框
      iotMeter: { width: 34, height: 22 },
      pillar: { width: 30, height: 20 },
      regulator: { width: 24, height: 24 },
      heatShrinkSleeve: { width: 36, height: 10 },
      junction: { width: 20, height: 20 }
    };
    return baseSizes[type] || { width: 24, height: 12 };
  }, []);

  // 计算设备间最小安全距离
  const calculateMinSafeDistance = useCallback((device1Type, device2Type) => {
    const size1 = getDeviceSize(device1Type);
    const size2 = getDeviceSize(device2Type);
    
    // 基础安全距离 = 两设备最大宽度之和的一半 + 安全边距
    const safetyMargin = 8; // 额外安全边距
    const minDistance = (Math.max(size1.width, size1.height) + Math.max(size2.width, size2.height)) / 2 + safetyMargin;
    
    return minDistance;
  }, [getDeviceSize]);

  // 检查位置是否与现有设备重叠
  const checkPositionOverlap = useCallback((x, y, deviceType, existingComponents) => {
    for (const comp of existingComponents) {
      const distance = Math.hypot(x - comp.x, y - comp.y);
      const minSafeDistance = calculateMinSafeDistance(deviceType, comp.type);
      
      if (distance < minSafeDistance) {
        return true; // 发生重叠
      }
    }
    return false; // 无重叠
  }, [calculateMinSafeDistance]);

  // 更严格的几何重叠检测：同段使用沿段距离，跨段回退到欧氏距离
  const projectFractionOntoSegment = useCallback((px, py, seg) => {
    const x1 = seg.startPoint.x, y1 = seg.startPoint.y;
    const x2 = seg.endPoint.x, y2 = seg.endPoint.y;
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return 0;
    const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    return Math.max(0, Math.min(1, t));
  }, []);

  // 平面视图：组件/配件的覆盖位置更新（不影响系统视图）
  const onMoveComponentPlan = useCallback(({ id, x, y }) => {
    if (!id) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      updatePlanComponentPosition(id, null);
      return;
    }
    updatePlanComponentPosition(id, { x, y });
  }, [updatePlanComponentPosition]);

  const onMoveFittingPlan = useCallback(({ id, x, y }) => {
    if (!id) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      updatePlanFittingPosition(id, null);
      return;
    }
    updatePlanFittingPosition(id, { x, y });
  }, [updatePlanFittingPosition]);

  // 移动模式：组件拖拽更新
  // - 管线型设备：沿最近/指定管段更新 fraction 与 segmentId
  // - 平面类型（房间/门/窗）：自由拖拽，仅更新 x/y，segmentId 置空，fraction 清除
  const onMoveComponent = useCallback(({ id, segmentId, x, y }) => {
    setComponents(prev => prev.map(c => {
      if (c.id !== id) return c;
      // 平面类型：segmentId 为空时自由移动，但 window 需限制到房间墙体
      if (segmentId == null) {
        if (c.type === 'window' || c.type === 'door') {
          const localFindNearestRoom = (px, py) => {
            let best = null, bestDist = Infinity;
            for (const rc of prev) {
              if (rc?.type !== 'room') continue;
              const { hx, hy } = getRoomDims(rc);
              const cx = rc.x, cy = rc.y;
              const dx = Math.max(Math.abs(px - cx) - hx, 0);
              const dy = Math.max(Math.abs(py - cy) - hy, 0);
              const d = Math.hypot(dx, dy);
              if (d < bestDist) { bestDist = d; best = rc; }
            }
            return best;
          };
          const assocRoom = c.roomId ? prev.find(rc => rc.id === c.roomId) : localFindNearestRoom(x, y);
          if (!assocRoom) return c; // 无房间：保持原位，不移动
          const clamped = clampPointToRoomWall(x, y, assocRoom);
          if (!clamped) return c; // 房间墙体无效：保持不动
          return { ...c, x: clamped.x, y: clamped.y, segmentId: null, fraction: null, roomId: assocRoom.id, wallSide: clamped.side, wallPos: clamped.t };
        }
        return { ...c, x, y, segmentId: null, fraction: null };
      }
      // 管线型：维持沿段约束
      const seg = segments.find(s => s.id === segmentId);
      const fraction = seg ? projectFractionOntoSegment(x, y, seg) : c.fraction;
      return { ...c, x, y, segmentId, fraction };
    }));
    updatePlanComponentPosition(id, null);
  }, [setComponents, segments, projectFractionOntoSegment, clampPointToRoomWall, getRoomDims, updatePlanComponentPosition]);

  // 移动模式：轻移选中组件沿管段方向
  const onNudgeSelected = useCallback((sign = 1) => {
    const c = selectedComponent;
    if (!c) return;
    let seg = c.segmentId ? segments.find(s => s.id === c.segmentId) : null;
    if (!seg) {
      // 根据当前位置寻找最近管段（阈值内视为同段）
      let bestSeg = null;
      let bestDist = Infinity;
      for (const s of segments) {
        const d = pointDistanceToSegment(c.x, c.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
        if (d < bestDist) { bestDist = d; bestSeg = s; }
      }
      const threshold = 3;
      if (bestSeg && bestDist <= threshold) {
        seg = bestSeg;
      } else {
        return;
      }
    }

    const segLen = calculateDistance(seg.startPoint, seg.endPoint);
    if (segLen <= 0) return;

    const buffer = Math.min(segLen * 0.08, 12);
    const tMin = buffer / segLen;
    const tMax = 1 - tMin;

    const currentT = c.fraction != null ? c.fraction : projectFractionOntoSegment(c.x, c.y, seg);
    const stepWorld = Math.max(2, Math.min(12, segLen * 0.02));
    const stepT = stepWorld / segLen;

    const nextT = Math.max(tMin, Math.min(tMax, currentT + sign * stepT));
    const nx = seg.startPoint.x + (seg.endPoint.x - seg.startPoint.x) * nextT;
    const ny = seg.startPoint.y + (seg.endPoint.y - seg.startPoint.y) * nextT;

    onMoveComponent({ id: c.id, segmentId: seg.id, x: nx, y: ny });
    saveCurrentProject();
  }, [selectedComponent, segments, onMoveComponent, projectFractionOntoSegment, calculateDistance, saveCurrentProject]);

  // 移动模式：配件沿管线拖拽时更新位置与沿段比例
  const onMoveFitting = useCallback(({ id, segmentId, x, y }) => {
    setFittings(prev => prev.map(f => {
      if (f.id !== id) return f;
      const seg = segments.find(s => s.id === segmentId);
      const fraction = seg ? projectFractionOntoSegment(x, y, seg) : f.fraction;
      return { ...f, x, y, segmentId, fraction };
    }));
    updatePlanFittingPosition(id, null);
  }, [setFittings, segments, projectFractionOntoSegment, updatePlanFittingPosition]);

  const isOnSegmentGeneric = useCallback((x, y, seg, threshold = 3) => {
    return pointDistanceToSegment(x, y, seg.startPoint.x, seg.startPoint.y, seg.endPoint.x, seg.endPoint.y) <= threshold;
  }, [pointDistanceToSegment]);

  const checkPositionOverlapStrict = useCallback((x, y, deviceType, existingComponents, segHint = null) => {
    for (const comp of existingComponents) {
      const otherSeg = comp.segmentId ? segments.find(s => s.id === comp.segmentId) : null;
      const seg = segHint || otherSeg;
      if (seg) {
        // 同段：使用沿段距离
        const segLen = calculateDistance(seg.startPoint, seg.endPoint);
        const tNew = projectFractionOntoSegment(x, y, seg);
        const tComp = comp.fraction != null ? comp.fraction : projectFractionOntoSegment(comp.x, comp.y, seg);
        const distAlong = Math.abs(tNew - tComp) * segLen;
        const minSafe = calculateMinSafeDistance(deviceType, comp.type);
        if (distAlong < minSafe) return true;
      } else {
        // 无段信息：使用欧氏距离
        const d = Math.hypot(x - comp.x, y - comp.y);
        const minSafe = calculateMinSafeDistance(deviceType, comp.type);
        if (d < minSafe) return true;
      }
    }
    return false;
  }, [segments, calculateDistance, projectFractionOntoSegment, calculateMinSafeDistance]);

  // 在指定段上分解重叠：按沿段顺序重排元素，尽量满足最小安全距
  const resolveSegmentOverlaps = useCallback((segment, comps) => {
    if (!segment || !Array.isArray(comps) || comps.length === 0) return comps;
    const segLen = calculateDistance(segment.startPoint, segment.endPoint);
    const buffer = Math.min(segLen * 0.08, 12);
    const clampT = (t) => Math.max(buffer / segLen, Math.min(1 - buffer / segLen, t));

    let sorted = comps.map(c => {
      const t = c.fraction != null ? c.fraction : projectFractionOntoSegment(c.x, c.y, segment);
      return { ...c, fraction: clampT(t) };
    }).sort((a, b) => a.fraction - b.fraction);

    // 先线性推进，满足最小间距
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const minSafe = calculateMinSafeDistance(prev.type, cur.type);
      const spacingT = minSafe / segLen;
      if (cur.fraction < prev.fraction + spacingT) {
        sorted[i].fraction = clampT(prev.fraction + spacingT);
      }
    }

    // 如末端超界，则按压缩后的间距重新分布
    const endLimit = 1 - buffer / segLen;
    if (sorted[sorted.length - 1].fraction > endLimit) {
      // 计算总需求间距
      let required = 0;
      const pairSpacing = [];
      for (let i = 1; i < sorted.length; i++) {
        const s = calculateMinSafeDistance(sorted[i - 1].type, sorted[i].type);
        pairSpacing.push(s);
        required += s;
      }
      const available = segLen - 2 * buffer;
      const scaleFactor = required > 0 ? Math.min(1, available / required) : 1;

      let t = buffer / segLen;
      for (let i = 0; i < sorted.length; i++) {
        sorted[i].fraction = clampT(t);
        t += (i < pairSpacing.length ? (pairSpacing[i] * scaleFactor) / segLen : 0);
      }
    }

    // 写回坐标
    const sx = segment.startPoint.x, sy = segment.startPoint.y;
    const ex = segment.endPoint.x, ey = segment.endPoint.y;
    sorted = sorted.map(c => {
      const x = sx + (ex - sx) * c.fraction;
      const y = sy + (ey - sy) * c.fraction;
      return { ...c, x, y, segmentId: segment.id };
    });

    return sorted;
  }, [calculateDistance, calculateMinSafeDistance, projectFractionOntoSegment]);

  // 插入设备（带重叠约束 + 分段腾挪）
  const insertDeviceWithConstraints = useCallback((type, x, y, extras = {}) => {
    // 防御性校验：接驳点ID需唯一且非空
    if (type === 'junction') {
      const v = String(extras?.junctionId || '').trim();
      if (!v) {
        alert('接驳点ID不能为空');
        return;
      }
      const exists = (components || []).some(c => c?.type === 'junction' && String(c?.junctionId || '').trim() === v);
      if (exists) {
        alert('接驳点ID已存在，请更换一个ID以避免冲突');
        return;
      }
    }

    // 记录历史快照（仅在通过校验后）
    pushHistory(`insert:${type}`);

    const seg = extras.segmentId ? segments.find(s => s.id === extras.segmentId) : null;
    // Ball valves (copperValve, flangeValve, explosionProofValve) should match the segment's diameter
    const isValveType = type === 'copperValve' || type === 'flangeValve' || type === 'explosionProofValve';
    const boundDiameter = ((type === 'heatShrinkSleeve' || isValveType) && seg) ? seg.diameter : selectedDiameter;
    const newComp = {
      id: Date.now().toString(),
      type,
      x,
      y,
      diameter: boundDiameter,
      origin: 'insert',
      ...extras,
    };

    // 情况A：不在任何段上，进行全局重叠检测并简单插入
    if (!seg) {
      const overlapped = checkPositionOverlapStrict(x, y, type, components, null);
      if (!overlapped) {
        setComponents(prev => [...prev, newComp]);
        saveCurrentProject();
        logOperation('insert', { type, x, y, segmentId: null });
      } else {
        // 退化处理：稍微偏移一个安全距离
        const safe = getDeviceSize(type);
        const offset = Math.max(safe.width, safe.height);
        const nx = x + offset;
        const ny = y;
        setComponents(prev => [...prev, { ...newComp, x: nx, y: ny }]);
        saveCurrentProject();
        logOperation('insert_adjusted', { type, x: nx, y: ny, segmentId: null, reason: 'overlap-global' });
      }
      return;
    }

    // 情况B：位于某段上。收集该段内组件并尝试重排（无损）
    const onSeg = components.filter(c => isOnSegmentGeneric(c.x, c.y, seg));

    // 对 (段内组件 + 新设备) 进行重排，得到沿段的 fraction
    const redistributed = resolveSegmentOverlaps(seg, [...onSeg, newComp]);

    // 找到新设备重排后的精确沿段位置
    const placed = redistributed.find(c => c.id === newComp.id) || newComp;
    const tInsert = placed.fraction != null ? placed.fraction : projectFractionOntoSegment(placed.x, placed.y, seg);

    // 将重排结果映射回原段坐标，保持 segmentId 为原段
    const sx = seg.startPoint.x, sy = seg.startPoint.y;
    const ex = seg.endPoint.x, ey = seg.endPoint.y;
    const mapped = redistributed.map(c => {
       const f = c.fraction != null ? c.fraction : projectFractionOntoSegment(c.x, c.y, seg);
       const xPos = sx + (ex - sx) * f;
       const yPos = sy + (ey - sy) * f;
       const segLen = (seg.geoLength != null ? seg.geoLength : Math.hypot(seg.endPoint.x - seg.startPoint.x, seg.endPoint.y - seg.startPoint.y));
       const chainage = segLen * f;
       return { ...c, x: xPos, y: yPos, segmentId: seg.id, fraction: f, chainage };
     });

    // 写回 components，仅替换该段上的设备；segments 不变
    const keepOthers = components.filter(c => !onSeg.some(o => o.id === c.id));
    const nextComponents = [...keepOthers, ...mapped];
    setComponents(nextComponents);

    // 保持当前选中段不变
    setSelectedSegment(seg);

    // 拓扑验证：不改变段数量与总长度
    const preSegCount = segments.length;
    const preLenSum = segments.reduce((sum, s) => sum + (s.geoLength || Math.hypot(s.endPoint.x - s.startPoint.x, s.endPoint.y - s.startPoint.y)), 0);

    saveCurrentProject();
    logOperation('insert_on_segment_nondestructive', {
      type,
      segmentId: seg.id,
      x: sx + (ex - sx) * tInsert,
      y: sy + (ey - sy) * tInsert,
      t: tInsert,
      segCount: preSegCount,
      totalGeoLength: preLenSum
    });
  }, [segments, components, selectedDiameter, getDeviceSize, isOnSegmentGeneric, checkPositionOverlapStrict, resolveSegmentOverlaps, projectFractionOntoSegment, saveCurrentProject, pushHistory, logOperation]);

  // 重写的设备位置计算函数 - 确保均匀分布且支持自动延长
  const calculateOptimizedPlacements = useCallback((chainSegments, deviceType, existingComponents = [], want = 0) => {
    if (want === 0) return [];
    
    const deviceSize = getDeviceSize(deviceType);
    const effectiveDeviceLength = Math.max(deviceSize.width, deviceSize.height) * scale;
    
    // 固定间距设置 - 不考虑实际物理长度
    const FIXED_DEVICE_SPACING = effectiveDeviceLength * 2.0; // 固定设备间距
    const ENDPOINT_BUFFER = FIXED_DEVICE_SPACING * 0.5; // 端点缓冲区
    
    // 计算所需的总长度
    const requiredTotalLength = want > 1 
      ? (want - 1) * FIXED_DEVICE_SPACING + 2 * ENDPOINT_BUFFER
      : 2 * ENDPOINT_BUFFER;
    
    // 计算当前链的总几何长度
    const currentTotalLength = chainSegments.reduce((sum, segment) => {
      return sum + Math.hypot(
        segment.endPoint.x - segment.startPoint.x,
        segment.endPoint.y - segment.startPoint.y
      );
    }, 0);
    
    // 如果当前长度不足，返回空数组，让调用方处理延长
    if (currentTotalLength < requiredTotalLength) {
      return [];
    }
    
    // 在整个链上均匀分布设备
    const placements = [];
    
    if (want === 1) {
      // 单个设备放在链的中心
      const totalLength = currentTotalLength;
      const targetPosition = totalLength / 2;
      
      let accumulatedLength = 0;
      for (const segment of chainSegments) {
        const segmentLength = Math.hypot(
          segment.endPoint.x - segment.startPoint.x,
          segment.endPoint.y - segment.startPoint.y
        );
        
        if (accumulatedLength + segmentLength >= targetPosition) {
          const positionInSegment = targetPosition - accumulatedLength;
          const fraction = positionInSegment / segmentLength;
          
          const x = segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * fraction;
          const y = segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * fraction;
          
          placements.push({
            x, y,
            diameter: segment.diameter,
            segmentId: segment.id,
            fraction: fraction
          });
          break;
        }
        accumulatedLength += segmentLength;
      }
    } else {
      // 多个设备均匀分布
      for (let i = 0; i < want; i++) {
        // 计算设备在整个链上的目标位置
        const targetPosition = ENDPOINT_BUFFER + i * FIXED_DEVICE_SPACING;
        
        // 找到对应的管段和位置
        let accumulatedLength = 0;
        let placed = false;
        
        for (const segment of chainSegments) {
          const segmentLength = Math.hypot(
            segment.endPoint.x - segment.startPoint.x,
            segment.endPoint.y - segment.startPoint.y
          );
          
          if (accumulatedLength + segmentLength >= targetPosition) {
            const positionInSegment = targetPosition - accumulatedLength;
            const fraction = Math.max(0.05, Math.min(0.95, positionInSegment / segmentLength));
            
            const x = segment.startPoint.x + (segment.endPoint.x - segment.startPoint.x) * fraction;
            const y = segment.startPoint.y + (segment.endPoint.y - segment.startPoint.y) * fraction;
            
            // 检查是否与现有设备重叠
            if (!checkPositionOverlap(x, y, deviceType, existingComponents)) {
              placements.push({
                x, y,
                diameter: segment.diameter,
                segmentId: segment.id,
                fraction: fraction
              });
              
              // 添加到现有组件列表以避免后续重叠
              existingComponents.push({ x, y, type: deviceType });
              placed = true;
            }
            break;
          }
          accumulatedLength += segmentLength;
        }
        
        if (!placed) {
          
        }
      }
    }
    
    return placements;
  }, [getDeviceSize, scale, checkPositionOverlap]);

  /**
   * 智能重新分布组件位置，确保在优化后的管线段上均匀分布
   * @param {Array} components - 原始组件数组
   * @param {Array} optimizedSegments - 优化后的管线段数组
   * @param {Array} originalSegments - 原始管线段数组
   * @returns {Array} 重新分布后的组件数组
   */
  const redistributeComponentsUniformly = useCallback((components, optimizedSegments, originalSegments) => {
    // 按管线段分组组件
    const componentsBySegment = new Map();
    
    components.forEach(comp => {
      // 找到最近的原始管线段
      let closestSegment = null;
      let minDistance = Infinity;
      
      originalSegments.forEach(seg => {
        const distance = pointDistanceToSegment(
          comp.x, comp.y,
          seg.startPoint.x, seg.startPoint.y,
          seg.endPoint.x, seg.endPoint.y
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestSegment = seg;
        }
      });
      
      if (closestSegment) {
        if (!componentsBySegment.has(closestSegment.id)) {
          componentsBySegment.set(closestSegment.id, []);
        }
        componentsBySegment.get(closestSegment.id).push(comp);
      }
    });
    
    const redistributedComponents = [];
    
    // 为每个管线段重新分布其组件
    componentsBySegment.forEach((segmentComponents, segmentId) => {
      const optimizedSeg = optimizedSegments.find(s => s.id === segmentId);
      if (!optimizedSeg || segmentComponents.length === 0) {
        // 如果找不到对应的优化段或没有组件，保持原位置
        redistributedComponents.push(...segmentComponents);
        return;
      }
      
      // 按设备类型分组
      const componentsByType = new Map();
      segmentComponents.forEach(comp => {
        if (!componentsByType.has(comp.type)) {
          componentsByType.set(comp.type, []);
        }
        componentsByType.get(comp.type).push(comp);
      });
      
      // 为每种设备类型计算均匀分布位置
      componentsByType.forEach((typeComponents, deviceType) => {
        const count = typeComponents.length;
        if (count === 0) return;
        
        // 计算设备尺寸和间距
        const deviceSize = getDeviceSize(deviceType);
        const effectiveDeviceLength = Math.max(deviceSize.width, deviceSize.height) * scale;
        const minSpacing = effectiveDeviceLength * 1.8;
        const endpointBuffer = minSpacing * 0.8;
        
        const segmentLength = calculateDistance(optimizedSeg.startPoint, optimizedSeg.endPoint);
        const availableLength = segmentLength - 2 * endpointBuffer;
        
        // 生成均匀分布的位置
        let positions = [];
        if (count === 1) {
          positions = [0.5]; // 中心位置
        } else if (count === 2) {
          positions = [0.33, 0.67]; // 三等分点
        } else if (count === 3) {
          positions = [0.25, 0.5, 0.75]; // 四等分点
        } else {
          // 多个设备时使用改进的均匀间距算法
          const totalRequiredSpace = minSpacing * (count - 1);
          
          if (availableLength >= totalRequiredSpace) {
            // 空间充足，使用理想间距
            const actualSpacing = Math.max(minSpacing, availableLength / (count - 1));
            for (let i = 0; i < count; i++) {
              const t = (endpointBuffer + i * actualSpacing) / segmentLength;
              positions.push(Math.max(0.1, Math.min(0.9, t)));
            }
          } else {
            // 空间紧张，但确保最小间距
            const reducedMinSpacing = effectiveDeviceLength * 1.2; // 减少最小间距要求
            const reducedTotalSpace = reducedMinSpacing * (count - 1);
            
            if (availableLength >= reducedTotalSpace) {
              // 使用减少的最小间距
              const actualSpacing = Math.max(reducedMinSpacing, availableLength / (count - 1));
              for (let i = 0; i < count; i++) {
                const t = (endpointBuffer + i * actualSpacing) / segmentLength;
                positions.push(Math.max(0.1, Math.min(0.9, t)));
              }
            } else {
              // 极端情况：使用设备自身长度作为最小间距
              const minimalSpacing = effectiveDeviceLength;
              const minimalTotalSpace = minimalSpacing * (count - 1);
              
              if (availableLength >= minimalTotalSpace) {
                const actualSpacing = Math.max(minimalSpacing, availableLength / (count - 1));
                for (let i = 0; i < count; i++) {
                  const t = (endpointBuffer + i * actualSpacing) / segmentLength;
                  positions.push(Math.max(0.1, Math.min(0.9, t)));
                }
              } else {
                // 最后的回退方案：均匀分布在可用空间内，但可能重叠
                
                for (let i = 0; i < count; i++) {
                  const t = (endpointBuffer + (i * availableLength) / Math.max(1, count - 1)) / segmentLength;
                  positions.push(Math.max(0.1, Math.min(0.9, t)));
                }
              }
            }
          }
        }
        
        // 应用新位置到组件
        typeComponents.forEach((comp, index) => {
          if (index < positions.length) {
            const fraction = positions[index];
            const newX = optimizedSeg.startPoint.x + (optimizedSeg.endPoint.x - optimizedSeg.startPoint.x) * fraction;
            const newY = optimizedSeg.startPoint.y + (optimizedSeg.endPoint.y - optimizedSeg.startPoint.y) * fraction;
            
            redistributedComponents.push({
              ...comp,
              x: newX,
              y: newY
            });
          } else {
            // 如果位置不够，保持原组件属性但更新到段的中心
            const newX = optimizedSeg.startPoint.x + (optimizedSeg.endPoint.x - optimizedSeg.startPoint.x) * 0.5;
            const newY = optimizedSeg.startPoint.y + (optimizedSeg.endPoint.y - optimizedSeg.startPoint.y) * 0.5;
            
            redistributedComponents.push({
              ...comp,
              x: newX,
              y: newY
            });
          }
        });
      });
    });
    
    // 添加没有关联到任何段的组件（保持原位置）
    components.forEach(comp => {
      const found = redistributedComponents.some(redisComp => redisComp.id === comp.id);
      if (!found) {
        redistributedComponents.push(comp);
      }
    });
    
    return redistributedComponents;
  }, [getDeviceSize, scale, calculateDistance, pointDistanceToSegment]);

  /**
   * 设置选中管道链上的中间球阀数量（铜、法兰或防爆电磁），并触发重绘与保存
   * - 镀锌钢管使用 `copperValve`
   * - 无缝/直缝钢管使用 `flangeValve`
   * - 防爆电磁球阀使用 `explosionProofValve`
   * - PE 管不配置球阀
   * @param {'copperValve'|'flangeValve'|'explosionProofValve'} type
   * @param {number} desiredCount
   */
  const setChainValveCount = useCallback((type, desiredCount) => {
    if (!selectedSegment) return;
    const chain = getConnectedChain(selectedSegment);
    if (chain.length === 0) return;

    // 优化的管线长度计算函数
    const calculateOptimalPipelineLength = (deviceCount, deviceType) => {
      if (deviceCount === 0) return 0;
      
      const deviceSize = getDeviceSize(deviceType);
      const effectiveDeviceLength = Math.max(deviceSize.width, deviceSize.height) * scale;
      
      // 根据设备类型调整间距系数
      let spacingMultiplier = 2.0;
      if (deviceType === 'copperValve') {
        spacingMultiplier = 1.8; // 铜球阀可以稍微紧凑一些
      } else if (deviceType === 'flangeValve') {
        spacingMultiplier = 2.2; // 法兰球阀需要更多空间
      } else if (deviceType === 'explosionProofValve') {
        spacingMultiplier = 2.5; // 电磁阀需要最多空间
      }
      
      const DEVICE_SPACING = effectiveDeviceLength * spacingMultiplier;
      const ENDPOINT_BUFFER = DEVICE_SPACING * 0.6; // 端点缓冲区
      
      // 考虑设备密度的动态调整
      let densityFactor = 1.0;
      if (deviceCount > 10) {
        densityFactor = 0.9; // 设备多时可以稍微紧凑
      } else if (deviceCount < 3) {
        densityFactor = 1.2; // 设备少时给更多空间
      }
      
      const adjustedSpacing = DEVICE_SPACING * densityFactor;
      
      if (deviceCount === 1) {
        return 2 * ENDPOINT_BUFFER;
      } else {
        return (deviceCount - 1) * adjustedSpacing + 2 * ENDPOINT_BUFFER;
      }
    };

    // 端点集合用于识别末端（不计入中间球阀）
    const degree = new Map();
    const pointKey = (p) => `${p.x},${p.y}`;
    const addDegree = (p) => degree.set(pointKey(p), (degree.get(pointKey(p)) || 0) + 1);
    chain.forEach(s => { addDegree(s.startPoint); addDegree(s.endPoint); });
    const endpoints = chain.flatMap(s => [s.startPoint, s.endPoint]).filter(p => (degree.get(pointKey(p)) || 0) === 1);

    const threshold = 3;
    const isOnChain = (x, y) => {
      for (const s of chain) {
        const d = pointDistanceToSegment(x, y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
        if (d <= threshold) return true;
      }
      return false;
    };
    // 端点邻近判断：用于过滤中间阀门（避免统计端点阀）
    const nearAnyEndpoint = (x, y) => endpoints.some(ep => Math.hypot(x - ep.x, y - ep.y) <= threshold);
    // 动态端点阈值：根据分段长度自适应，避免所有候选位置被误判为靠近端点
    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    const nearSegmentEndpoints = (s, x, y) => {
      const segLen = dist(s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
      const placeThreshold = Math.min(3, Math.max(1, segLen * 0.1)); // 端点邻近阈值：1~3，自适应分段长度
      const dStart = dist(x, y, s.startPoint.x, s.startPoint.y);
      const dEnd = dist(x, y, s.endPoint.x, s.endPoint.y);
      return (dStart <= placeThreshold) || (dEnd <= placeThreshold);
    };

    // 当前中间阀门列表
    const currentMiddle = components.filter(c => c.type === type && isOnChain(c.x, c.y) && !nearAnyEndpoint(c.x, c.y));
    const curCount = currentMiddle.length;
    // 更稳健的数量解析：统一使用 Number(desiredCount) 以支持字符串输入
    const want = Math.max(0, Math.floor(Number(desiredCount)));
    if (want === curCount) return;

    // 获取当前链上的所有现有设备（用于重叠检测）
    const existingDevicesOnChain = components.filter(c => isOnChain(c.x, c.y));

    // 计算可用放置位置的函数（带重叠检测）
    const calculatePlacements = (chainSegments) => {
      // 首先尝试使用优化的位置计算
      const optimizedPlacements = calculateOptimizedPlacements(chainSegments, type, existingDevicesOnChain, want);
      
      if (optimizedPlacements.length >= want) {
        
        return optimizedPlacements;
      }
      
      // 如果优化计算不足，回退到原始方法
      
      const placements = [];
      const fractions = [0.5, 0.25, 0.75, 1/3, 2/3];
      for (const s of chainSegments) {
        for (const frac of fractions) {
          const x = s.startPoint.x + (s.endPoint.x - s.startPoint.x) * frac;
          const y = s.startPoint.y + (s.endPoint.y - s.startPoint.y) * frac;
          if (nearSegmentEndpoints(s, x, y)) continue; // 避免靠近当前分段端点
          placements.push({ x, y, diameter: s.diameter });
          if (placements.length >= want) break;
        }
        if (placements.length >= want) break;
      }
      // 回退：若所有候选因端点邻近被过滤且仍需要添加，则允许使用各段中点位置（不做端点过滤）
      if (placements.length === 0 && want > 0) {
        for (const s of chainSegments) {
          const x = (s.startPoint.x + s.endPoint.x) / 2;
          const y = (s.startPoint.y + s.endPoint.y) / 2;
          placements.push({ x, y, diameter: s.diameter });
          if (placements.length >= Math.min(chainSegments.length, want)) break;
        }
      }
      return placements;
    };

    // 初始计算可用位置，使用优化的位置计算
    let placements = calculateOptimizedPlacements(chain, type, existingDevicesOnChain, want);
    let currentChain = [...chain];

    // 检测空间不足并自动延长管线
    if (placements.length === 0 && want > 0) {
      
      // 使用优化的长度计算函数
      const requiredTotalLength = calculateOptimalPipelineLength(want, type);
      
      const currentTotalLength = currentChain.reduce((sum, segment) => {
        return sum + Math.hypot(
          segment.endPoint.x - segment.startPoint.x,
          segment.endPoint.y - segment.startPoint.y
        );
      }, 0);
      
      const extensionNeeded = requiredTotalLength - currentTotalLength;
      
      // 找到链的自由端点（度数为1的端点）
      const freeEndpoints = endpoints.filter(ep => {
        const connectedCount = currentChain.filter(s => 
          (Math.hypot(s.startPoint.x - ep.x, s.startPoint.y - ep.y) < 0.1) ||
          (Math.hypot(s.endPoint.x - ep.x, s.endPoint.y - ep.y) < 0.1)
        ).length;
        return connectedCount === 1;
      });

      if (freeEndpoints.length > 0 && extensionNeeded > 0) {
        // 选择第一个自由端点进行延长
        const extendPoint = freeEndpoints[0];
        
        // 找到连接到该端点的管段
        const connectedSegment = currentChain.find(s => 
          Math.hypot(s.startPoint.x - extendPoint.x, s.startPoint.y - extendPoint.y) < 0.1 ||
          Math.hypot(s.endPoint.x - extendPoint.x, s.endPoint.y - extendPoint.y) < 0.1
        );

        if (connectedSegment) {
          // 计算延长方向
          const isStartPoint = Math.hypot(connectedSegment.startPoint.x - extendPoint.x, connectedSegment.startPoint.y - extendPoint.y) < 0.1;
          const otherPoint = isStartPoint ? connectedSegment.endPoint : connectedSegment.startPoint;
          const angle = Math.atan2(extendPoint.y - otherPoint.y, extendPoint.x - otherPoint.x);
          
          // 使用连接段的材质和直径
          const extendMaterial = connectedSegment.material;
          const extendDiameter = connectedSegment.diameter;
          
          // 计算需要创建的延长段数量和长度
          const defaultSegmentLength = getDefaultLengthForMaterial(extendMaterial);
          const minSegmentsNeeded = Math.ceil(extensionNeeded / defaultSegmentLength);
          
          // 创建延长段
          const newSegments = [];
          let currentExtendPoint = { ...extendPoint };
          let remainingExtension = extensionNeeded;
          
          for (let i = 0; i < minSegmentsNeeded; i++) {
            // 计算这一段的长度
            const segmentLength = Math.min(defaultSegmentLength, remainingExtension);
            
            const nextPoint = {
              x: currentExtendPoint.x + Math.cos(angle) * segmentLength,
              y: currentExtendPoint.y + Math.sin(angle) * segmentLength
            };
            
            const newSegment = {
              id: `extend-${Date.now()}-${i}`,
              startPoint: { ...currentExtendPoint },
              endPoint: { ...nextPoint },
              material: extendMaterial,
              diameter: extendDiameter,
              length: segmentLength,
              geoLength: calculateDistance(currentExtendPoint, nextPoint)
            };
            
            newSegments.push(newSegment);
            currentExtendPoint = nextPoint;
            remainingExtension -= segmentLength;
            
            if (remainingExtension <= 0) break;
          }
          

          
          // 验证连接正确性
          const validateConnection = (newSegs) => {
            // 检查第一个新管段是否正确连接到现有管线
            if (newSegs.length === 0) return true;
            
            const firstNewSegment = newSegs[0];
            const connectionPoint = firstNewSegment.startPoint;
            
            // 验证连接点是否与现有管线的端点匹配
            const isConnectedToExisting = currentChain.some(existingSegment => {
              const tolerance = 0.1;
              return (
                Math.hypot(existingSegment.startPoint.x - connectionPoint.x, existingSegment.startPoint.y - connectionPoint.y) < tolerance ||
                Math.hypot(existingSegment.endPoint.x - connectionPoint.x, existingSegment.endPoint.y - connectionPoint.y) < tolerance
              );
            });
            
            if (!isConnectedToExisting) {
              
              return false;
            }
            
            // 验证新管段之间的连接
            for (let i = 0; i < newSegs.length - 1; i++) {
              const current = newSegs[i];
              const next = newSegs[i + 1];
              const tolerance = 0.1;
              
              if (Math.hypot(current.endPoint.x - next.startPoint.x, current.endPoint.y - next.startPoint.y) > tolerance) {
                
                return false;
              }
            }
            
            return true;
          };
          
          // 执行连接验证
          if (!validateConnection(newSegments)) {
            return;
          }
          
          // 更新segments状态
          setSegments(prev => [...prev, ...newSegments]);
          
          // 更新当前链以包含新段
          currentChain = [...currentChain, ...newSegments];
          
          // 重新计算可用位置
          const updatedExistingDevices = components.filter(c => 
            c.type === type && 
            currentChain.some(s => isOnSegment(c.x, c.y, s))
          );
          placements = calculateOptimizedPlacements(currentChain, type, updatedExistingDevices, want);
          

        }
      }
    }

    setComponents(prev => {
      let next = [...prev];
      if (want > curCount) {
        const toAdd = want - curCount;
        for (let i = 0; i < toAdd; i++) {
          const p = placements.length ? (placements[i % placements.length] || placements[placements.length - 1]) : null;
          if (!p) break;
          next.push({ id: Date.now().toString() + '-' + i, type, x: p.x, y: p.y, diameter: p.diameter });
        }
      } else if (want < curCount) {
        const toRemove = curCount - want;
        const idsToRemove = currentMiddle.slice(-toRemove).map(c => c.id);
        next = next.filter(c => !(c.type === type && idsToRemove.includes(c.id)));
        
        // 自动缩短管线逻辑
        if (want > 0) {
          // 使用优化的长度计算函数
          const newRequiredLength = calculateOptimalPipelineLength(want, type);
          
          // 保留原有的FIXED_DEVICE_SPACING用于缩短阈值判断
          const deviceSize = getDeviceSize(type);
          const effectiveDeviceLength = Math.max(deviceSize.width, deviceSize.height) * scale;
          const FIXED_DEVICE_SPACING = effectiveDeviceLength * 2.0;
          
          const currentTotalLength = currentChain.reduce((sum, segment) => {
            return sum + Math.hypot(
              segment.endPoint.x - segment.startPoint.x,
              segment.endPoint.y - segment.startPoint.y
            );
          }, 0);
          
          const shrinkageNeeded = currentTotalLength - newRequiredLength;
          
          // 如果需要缩短且缩短量足够大，则执行缩短操作
          if (shrinkageNeeded > FIXED_DEVICE_SPACING) {
            // 找到链的自由端点（度数为1的端点）
            const freeEndpoints = endpoints.filter(ep => {
              const connectedCount = currentChain.filter(s => 
                (Math.hypot(s.startPoint.x - ep.x, s.startPoint.y - ep.y) < 0.1) ||
                (Math.hypot(s.endPoint.x - ep.x, s.endPoint.y - ep.y) < 0.1)
              ).length;
              return connectedCount === 1;
            });

            if (freeEndpoints.length > 0) {
              // 选择第一个自由端点进行缩短
              const shrinkPoint = freeEndpoints[0];
              
              // 找到从该端点开始的管段序列，按距离排序
              const segmentsFromEnd = [];
              let currentPoint = shrinkPoint;
              let remainingShrinkage = shrinkageNeeded;
              
              // 构建从端点开始的管段序列
              while (remainingShrinkage > 0) {
                const connectedSegment = currentChain.find(s => 
                  (Math.hypot(s.startPoint.x - currentPoint.x, s.startPoint.y - currentPoint.y) < 0.1) ||
                  (Math.hypot(s.endPoint.x - currentPoint.x, s.endPoint.y - currentPoint.y) < 0.1)
                );
                
                if (!connectedSegment || segmentsFromEnd.includes(connectedSegment)) break;
                
                const segmentLength = Math.hypot(
                  connectedSegment.endPoint.x - connectedSegment.startPoint.x,
                  connectedSegment.endPoint.y - connectedSegment.startPoint.y
                );
                
                segmentsFromEnd.push(connectedSegment);
                remainingShrinkage -= segmentLength;
                
                // 移动到下一个点
                const isStartPoint = Math.hypot(connectedSegment.startPoint.x - currentPoint.x, connectedSegment.startPoint.y - currentPoint.y) < 0.1;
                currentPoint = isStartPoint ? connectedSegment.endPoint : connectedSegment.startPoint;
              }
              
              // 验证缩短操作的安全性
               const validateShrinkage = (segmentsToRemove) => {
                 if (segmentsToRemove.length === 0) return true;
                 
                 // 检查是否会断开重要连接
                 const remainingSegments = currentChain.filter(s => !segmentsToRemove.includes(s));
                 if (remainingSegments.length === 0) {
                   
                   return false;
                 }
                 
                 // 检查剩余管段是否仍然连通
                 const checkConnectivity = (segments) => {
                   if (segments.length <= 1) return true;
                   
                   const visited = new Set();
                   const stack = [segments[0]];
                   visited.add(segments[0].id);
                   
                   while (stack.length > 0) {
                     const current = stack.pop();
                     
                     for (const segment of segments) {
                       if (visited.has(segment.id)) continue;
                       
                       // 检查是否连接
                       const tolerance = 0.1;
                       const connected = (
                         Math.hypot(current.startPoint.x - segment.startPoint.x, current.startPoint.y - segment.startPoint.y) < tolerance ||
                         Math.hypot(current.startPoint.x - segment.endPoint.x, current.startPoint.y - segment.endPoint.y) < tolerance ||
                         Math.hypot(current.endPoint.x - segment.startPoint.x, current.endPoint.y - segment.startPoint.y) < tolerance ||
                         Math.hypot(current.endPoint.x - segment.endPoint.x, current.endPoint.y - segment.endPoint.y) < tolerance
                       );
                       
                       if (connected) {
                         visited.add(segment.id);
                         stack.push(segment);
                       }
                     }
                   }
                   
                   return visited.size === segments.length;
                 };
                 
                 if (!checkConnectivity(remainingSegments)) {
                   
                   return false;
                 }
                 
                 return true;
               };
               
               // 移除需要缩短的管段
               if (segmentsFromEnd.length > 0 && validateShrinkage(segmentsFromEnd)) {
                 const segmentIdsToRemove = segmentsFromEnd.map(s => s.id);
                 setSegments(prevSegments => 
                   prevSegments.filter(s => !segmentIdsToRemove.includes(s.id))
                 );
                 
                 // 移除这些管段上的所有设备
                 next = next.filter(c => {
                   return !segmentsFromEnd.some(s => isOnSegment(c.x, c.y, s));
                 });
               }
            }
          }
        }
      }
      return next;
    });
    saveCurrentProject();
  }, [selectedSegment, segments, components, saveCurrentProject]);

  /**
   * 终端球阀开关：在选中链的端点添加或移除端点球阀
   * - 镀锌钢管：使用 copperValve
   * - 无缝/直缝钢管：使用 flangeValve
 * - PE 管：不启用（Bottom 区域按钮已禁用）
   */
  const handleToggleTerminalBallValve = useCallback(() => {
    if (!selectedSegment) return;
    const material = selectedSegment.material;
    if (material === 'PE100 SDR11' || material === 'PE100 SDR17') return;
    const type = (material === '镀锌钢管') ? 'copperValve' : 'flangeValve';

    const threshold = 3;
    const pointKey = (p) => `${p.x},${p.y}`;
    const nearEndpoint = (x, y, ep) => Math.hypot(x - ep.x, y - ep.y) <= threshold;

    // 计算整体网络的端点度数，用于判断是否"未连接的端点"
    const degreeAll = new Map();
    const addDegreeAll = (p) => degreeAll.set(pointKey(p), (degreeAll.get(pointKey(p)) || 0) + 1);
    segments.forEach(s => { addDegreeAll(s.startPoint); addDegreeAll(s.endPoint); });

    // 获取当前选中管段的两个端点，并筛选出未连接的端点
    const segmentEndpoints = [selectedSegment.startPoint, selectedSegment.endPoint];
    const unconnectedEndpoints = segmentEndpoints.filter(ep => 
      (degreeAll.get(pointKey(ep)) || 0) === 1
    );

    // 如果没有未连接的端点，则不执行任何操作
    if (unconnectedEndpoints.length === 0) return;

    // 判定当前管段的未连接端点是否已有球阀
    const hasEndpointValves = components.some(c => 
      c.type === type && unconnectedEndpoints.some(ep => nearEndpoint(c.x, c.y, ep))
    );

    if (hasEndpointValves) {
      // 移除当前管段未连接端点上的该类型阀门
      setComponents(prev => prev.filter(c => 
        !(c.type === type && unconnectedEndpoints.some(ep => nearEndpoint(c.x, c.y, ep)))
      ));
      saveCurrentProject();
      return;
    }

    // 添加：为当前管段的每个未连接端点添加一个阀门
    const additions = [];
    unconnectedEndpoints.forEach((ep, idx) => {
      additions.push({ 
        id: Date.now().toString() + '-seg-end-' + idx, 
        type, 
        x: ep.x, 
        y: ep.y, 
        diameter: selectedSegment.diameter 
      });
    });

    if (additions.length > 0) {
      setComponents(prev => [...prev, ...additions]);
      saveCurrentProject();
    }
  }, [selectedSegment, components, segments, saveCurrentProject]);

  /**
   * 物联网表段级开关：在选中段上添加或移除一个 IoT 表
   * - 非 PE 管道才启用
   * - 放置在段的中点（避开端点），直径沿用所在分段，记录 meterSpec
   */
  const handleToggleIotMeter = useCallback(() => {
    if (!selectedSegment) return;
    const material = selectedSegment.material;
    if (material === 'PE100 SDR11' || material === 'PE100 SDR17') return;

    const threshold = 3;
    
    // 计算整个网络的端点（用于避开端点）
    const pointKey = (p) => `${p.x},${p.y}`;
    const degreeAll = new Map();
    const addDegreeAll = (p) => degreeAll.set(pointKey(p), (degreeAll.get(pointKey(p)) || 0) + 1);
    segments.forEach(s => { addDegreeAll(s.startPoint); addDegreeAll(s.endPoint); });
    const allEndpoints = segments.flatMap(s => [s.startPoint, s.endPoint]).filter(p => (degreeAll.get(pointKey(p)) || 0) === 1);
    const nearAnyEndpoint = (x, y) => allEndpoints.some(ep => Math.hypot(x - ep.x, y - ep.y) <= threshold);

    // 是否在当前选中段上
    const isOnSelectedSegment = (x, y) => {
      const d = pointDistanceToSegment(x, y, selectedSegment.startPoint.x, selectedSegment.startPoint.y, selectedSegment.endPoint.x, selectedSegment.endPoint.y);
      return d <= threshold;
    };

    // 检查当前段上是否已存在表（不靠近端点）
    const existingMeters = components.filter(c => c.type === 'meter' && isOnSelectedSegment(c.x, c.y) && !nearAnyEndpoint(c.x, c.y));
    if (existingMeters.length > 0) {
      // 移除当前段上的所有 IoT 表
      const ids = new Set(existingMeters.map(m => m.id));
      setComponents(prev => prev.filter(c => !(c.type === 'meter' && ids.has(c.id))));
      saveCurrentProject();
      return;
    }

    // 添加一个：在当前段上生成候选点，优先选择不靠近端点、且不靠近球阀/已有表的点
    const onSegmentComponents = components.filter(c => isOnSelectedSegment(c.x, c.y));
    const nearTypesAt = (x, y, types, radius = 5) => onSegmentComponents.some(c => types.includes(c.type) && Math.hypot(x - c.x, y - c.y) <= radius);
    const avoidTypes = ['copperValve', 'flangeValve', 'meter'];
    
    const { startPoint: a, endPoint: b } = selectedSegment;
    const pts = [];
    const mk = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    // 避开端点的三处：35%、50%、65%
    pts.push(mk(0.35));
    pts.push(mk(0.5));
    pts.push(mk(0.65));
    
    let place = null;
    for (const p of pts) {
      if (nearAnyEndpoint(p.x, p.y)) continue;
      if (nearTypesAt(p.x, p.y, avoidTypes)) continue;
      place = { ...p, diameter: selectedSegment.diameter, segmentId: selectedSegment.id };
      break;
    }
    
    // 若所有候选都无效，则回退到段的中点
    if (!place) {
      place = { 
        x: (a.x + b.x) / 2, 
        y: (a.y + b.y) / 2, 
        diameter: selectedSegment.diameter, 
        segmentId: selectedSegment.id 
      };
    }
    
    if (place) {
      const newMeter = { 
        id: Date.now().toString() + '-meter', 
        type: 'meter', 
        x: place.x, 
        y: place.y, 
        diameter: place.diameter, 
        meterSpec: selectedMeterType, 
        segmentId: place.segmentId 
      };
      setComponents(prev => [...prev, newMeter]);
      saveCurrentProject();
    }
  }, [selectedSegment, segments, components, saveCurrentProject, selectedMeterType]);

  // 合并循环处理器：在选中链上“未安装/G2.5…G25”循环
  const handleCycleIotMeterCombined = useCallback(() => {
    if (!selectedSegment) return;
    const material = selectedSegment.material;
    if (material === 'PE100 SDR11' || material === 'PE100 SDR17') return;

    const threshold = 3;
    
    // 计算整个网络的端点（用于避开端点）
    const pointKey = (p) => `${p.x},${p.y}`;
    const degreeAll = new Map();
    const addDegreeAll = (p) => degreeAll.set(pointKey(p), (degreeAll.get(pointKey(p)) || 0) + 1);
    segments.forEach(s => { addDegreeAll(s.startPoint); addDegreeAll(s.endPoint); });
    const allEndpoints = segments.flatMap(s => [s.startPoint, s.endPoint]).filter(p => (degreeAll.get(pointKey(p)) || 0) === 1);
    const nearAnyEndpoint = (x, y) => allEndpoints.some(ep => Math.hypot(x - ep.x, y - ep.y) <= threshold);
    
    // 是否在当前选中段上
    const isOnSelectedSegment = (x, y) => {
      const d = pointDistanceToSegment(x, y, selectedSegment.startPoint.x, selectedSegment.startPoint.y, selectedSegment.endPoint.x, selectedSegment.endPoint.y);
      return d <= threshold;
    };

    // 当前状态
    const existingMeters = components.filter(c => c.type === 'meter' && isOnSelectedSegment(c.x, c.y) && !nearAnyEndpoint(c.x, c.y));
    const currentSpec = existingMeters[0]?.meterSpec || null;
    const combined = ['未安装', ...meterTypes];
    const currentIndex = combined.indexOf(currentSpec || '未安装');
    const nextIndex = (currentIndex + 1) % combined.length;
    const nextVal = combined[nextIndex];

    if (nextVal === '未安装') {
      if (existingMeters.length > 0) {
        const ids = new Set(existingMeters.map(m => m.id));
        setComponents(prev => prev.filter(c => !(c.type === 'meter' && ids.has(c.id))));
        saveCurrentProject();
      }
      return;
    }

    // 选择了某规格：保证当前段上仅一个表并设置 meterSpec
    setSelectedMeterType(nextVal); // 同步当前规格选择

    // 若已有则更新第一个并移除多余
    if (existingMeters.length > 0) {
      const keepId = existingMeters[0].id;
      setComponents(prev => prev.map(c => (
        c.type === 'meter' && c.id === keepId ? { ...c, meterSpec: nextVal } : c
      )).filter(c => !(c.type === 'meter' && c.id !== keepId && existingMeters.some(m => m.id === c.id))));
      saveCurrentProject();
      return;
    }

    // 添加一个：在当前段上生成候选点，优先选择不靠近端点、且不靠近球阀/已有表的点
    const onSegmentComponents = components.filter(c => isOnSelectedSegment(c.x, c.y));
    const nearTypesAt = (x, y, types, radius = 5) => onSegmentComponents.some(c => types.includes(c.type) && Math.hypot(x - c.x, y - c.y) <= radius);
    const avoidTypes = ['copperValve', 'flangeValve', 'meter'];
    
    const { startPoint: a, endPoint: b } = selectedSegment;
    const pts = [];
    const mk = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    // 避开端点的三处：35%、50%、65%
    pts.push(mk(0.35));
    pts.push(mk(0.5));
    pts.push(mk(0.65));
    
    let place = null;
    for (const p of pts) {
      if (nearAnyEndpoint(p.x, p.y)) continue;
      if (nearTypesAt(p.x, p.y, avoidTypes)) continue;
      place = { ...p, diameter: selectedSegment.diameter, segmentId: selectedSegment.id };
      break;
    }
    
    // 若所有候选都无效，则回退到段的中点
    if (!place) {
      place = { 
        x: (a.x + b.x) / 2, 
        y: (a.y + b.y) / 2, 
        diameter: selectedSegment.diameter, 
        segmentId: selectedSegment.id 
      };
    }
    
    if (place) {
      const newMeter = { 
        id: Date.now().toString() + '-meter', 
        type: 'meter', 
        x: place.x, 
        y: place.y, 
        diameter: place.diameter, 
        meterSpec: nextVal, 
        segmentId: place.segmentId 
      };
      setComponents(prev => [...prev, newMeter]);
      saveCurrentProject();
    }
  }, [selectedSegment, segments, components, saveCurrentProject, meterTypes]);

  // 调压箱合并循环处理器：全局唯一“未安装/RX25…RX150”循环
  const handleCycleRegulatorCombined = useCallback(() => {
    if (!selectedSegment) return;
    const material = selectedSegment.material;
    if (material === 'PE100 SDR11' || material === 'PE100 SDR17') return;
    const chain = getConnectedChain(selectedSegment);
    if (chain.length === 0) return;

    const threshold = 3;
    const pointKey = (p) => `${p.x},${p.y}`;
    const degree = new Map();
    const addDegree = (p) => degree.set(pointKey(p), (degree.get(pointKey(p)) || 0) + 1);
    chain.forEach(s => { addDegree(s.startPoint); addDegree(s.endPoint); });
    const endpoints = chain.flatMap(s => [s.startPoint, s.endPoint]).filter(p => (degree.get(pointKey(p)) || 0) === 1);
    const nearAnyEndpoint = (x, y) => endpoints.some(ep => Math.hypot(x - ep.x, y - ep.y) <= threshold);
    const isOnChain = (x, y) => {
      for (const s of chain) {
        const d = pointDistanceToSegment(x, y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
        if (d <= threshold) return true;
      }
      return false;
    };

    // 仅在与设计起点相连的管链上允许显示/切换调压箱
    const nearDesignStart = (p) => Math.hypot(p.x - designStartPoint.x, p.y - designStartPoint.y) <= threshold;
    const chainConnectedToDesignStart = chain.some(s => nearDesignStart(s.startPoint) || nearDesignStart(s.endPoint));
    if (!chainConnectedToDesignStart) return;

    const existingRegs = components.filter(c => c.type === 'regulator');
    const currentSpec = existingRegs[0]?.regulatorSpec || null;
    const combined = ['未安装', ...regulatorTypes];
    const currentIndex = combined.indexOf(currentSpec || '未安装');
    const nextIndex = (currentIndex + 1) % combined.length;
    const nextVal = combined[nextIndex];

    if (nextVal === '未安装') {
      if (existingRegs.length > 0) {
        const ids = new Set(existingRegs.map(r => r.id));
        setComponents(prev => prev.filter(c => !(c.type === 'regulator' && ids.has(c.id))));
        saveCurrentProject();
      }
      return;
    }

    // 目标端点：优先使用链的端点，若无端点（闭合链）则选取距离设计起点最近的段端点
    const candidates = endpoints.length ? endpoints : chain.flatMap(s => [s.startPoint, s.endPoint]);
    let targetEp = null;
    let bestDist = Infinity;
    candidates.forEach(ep => {
      const d = Math.hypot(ep.x - designStartPoint.x, ep.y - designStartPoint.y);
      if (d < bestDist) { bestDist = d; targetEp = ep; }
    });
    if (!targetEp) return;

    // 有选择规格：若已有且在当前链且靠近目标端点则更新，否则仅在无任何调压箱时添加到当前链的目标端点处
    setSelectedRegulatorType(nextVal);
    if (existingRegs.length > 0) {
      const reg = existingRegs[0];
      const onChain = isOnChain(reg.x, reg.y);
      const nearTarget = Math.hypot(reg.x - targetEp.x, reg.y - targetEp.y) <= threshold;
      if (!onChain || !nearTarget) {
        // 全局唯一且不在当前链/不在目标端点：不移动/不更新（其他管道隐藏此属性）
        return;
      }
      setComponents(prev => prev.map(c => (
        c.type === 'regulator' && c.id === reg.id ? { ...c, regulatorSpec: nextVal } : c
      )));
      saveCurrentProject();
      return;
    }

    // 添加一个到当前链：在目标端点处（靠近设计起点），直径沿用该端点关联的分段直径
    const segForEp = chain.find(s => (pointKey(s.startPoint) === pointKey(targetEp)) || (pointKey(s.endPoint) === pointKey(targetEp)));
    const dia = segForEp?.diameter || selectedSegment.diameter;
    const newReg = { id: Date.now().toString() + '-reg', type: 'regulator', x: targetEp.x, y: targetEp.y, diameter: dia, regulatorSpec: nextVal };
    setComponents(prev => [...prev, newReg]);
    saveCurrentProject();
  }, [selectedSegment, segments, components, saveCurrentProject, regulatorTypes]);

  // 自动插入调压箱：确认规格后，调压箱底部左侧小圆点对齐设计起点
  const insertRegulatorAutoAlign = useCallback((spec) => {
    // 设计起点必需
    if (!designStartPoint) return;
    const sx = designStartPoint.x, sy = designStartPoint.y;

    // 寻找离设计起点最近的管段（用于口径与绑定，不影响朝向）
    let bestSeg = null; let minD = Infinity;
    segments.forEach(s => {
      const d = pointDistanceToSegment(sx, sy, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
      if (d < minD) { minD = d; bestSeg = s; }
    });
    const ang = 0; // 调压箱图案不旋转，固定朝向

    // 与 CanvasView 保持一致的锚点偏移：宽 34*scale，高 22*scale，底部两个连接点，左侧内缩 4px
    // CanvasView 中 pxToWorld(px) = px / (scale * BASE_VISUAL_SCALE)，且传入 (px * scale)
    // 因此世界偏移量 = 原始像素值 / BASE_VISUAL_SCALE；其中 BASE_VISUAL_SCALE = 5
    const BASE_VISUAL_SCALE = 5;
    const halfW = 17 / BASE_VISUAL_SCALE; // 世界单位
    const halfH = 11 / BASE_VISUAL_SCALE; // 世界单位
    const inset = 4 / BASE_VISUAL_SCALE;  // 世界单位
    const leftX = -halfW + inset;
    const bottomY = halfH;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const dx = leftX * cos - bottomY * sin;
    const dy = leftX * sin + bottomY * cos;

    // 组件中心 = 目标锚点（设计起点） - 旋转后的偏移
    const cx = sx - dx;
    const cy = sy - dy;

    // 保持全局仅一个调压箱：若已有则更新规格并重定位；否则插入新组件
    const existingRegs = components.filter(c => c?.type === 'regulator');
    if (existingRegs.length > 0) {
      const keep = existingRegs[0];
      setComponents(prev => prev.map(c => (
        c.type === 'regulator' && c.id === keep.id
          ? { ...c, x: cx, y: cy, regulatorSpec: spec || c.regulatorSpec, diameter: bestSeg?.diameter || c.diameter, segmentId: bestSeg?.id || c.segmentId }
          : c
      )));
      updatePlanComponentPosition(keep.id, null);
      saveCurrentProject();
      return;
    }

    // 插入新调压箱（约束/绑定管段），直径沿用最近管段
    const extras = { regulatorSpec: spec, diameter: bestSeg?.diameter };
    if (bestSeg && bestSeg.id) extras.segmentId = bestSeg.id;
    insertDeviceWithConstraints('regulator', cx, cy, extras);
  }, [designStartPoint, segments, components, insertDeviceWithConstraints, saveCurrentProject, updatePlanComponentPosition]);

  /**
   * 处理缩放按钮点击（居中缩放并限制范围）
   * @param {boolean} increase - 是否增加缩放
   */
  const handleScaleChange = useCallback((increase) => {
    canvasViewRef.current?.zoomBy?.(increase ? 1.1 : 0.9);
  }, []);

  /**
   * 重置缩放到初始状态
   */
  const resetScale = useCallback(() => {
    canvasViewRef.current?.resetView?.();
  }, []);

  // 定位到画面中心（以当前设计起点）
  const centerToCurrentPoint = useCallback(() => {
    canvasViewRef.current?.centerCurrentPoint?.();
  }, []);





  // 稳定缩放按钮回调，避免父组件重渲染导致子组件重复刷新
  const onZoomIn = useCallback(() => handleScaleChange(true), [handleScaleChange]);
  const onZoomOut = useCallback(() => handleScaleChange(false), [handleScaleChange]);

  /**
   * 计算设备数量统计（球阀 + 调压箱规格 + 物联网表规格）
   * @returns {Object} 包含各类设备数量的对象
   */
  const calculateDevicesByType = useCallback(() => {
    const devices = {};

    components.forEach(component => {
      const diameter = component.diameter || '';
      const diaDisplay = formatDiameterForDisplay(diameter, { componentType: component.type });
      if (component.type === 'copperValve') {
        const key = `铜球阀-${diaDisplay}`;
        devices[key] = (devices[key] || 0) + 1;
      } else if (component.type === 'flangeValve') {
        const key = `法兰球阀-${diaDisplay}`;
        devices[key] = (devices[key] || 0) + 1;
      } else if (component.type === 'explosionProofValve') {
        const key = `防爆电磁球阀-${diaDisplay}`;
        devices[key] = (devices[key] || 0) + 1;
      } else if (component.type === 'regulator') {
        const spec = component.regulatorSpec || '未指定';
        const key = `调压箱-${spec}`;
        devices[key] = (devices[key] || 0) + 1;
      } else if (component.type === 'meter') {
        const spec = component.meterSpec || '未指定';
        const key = `物联网表-${spec}`;
        devices[key] = (devices[key] || 0) + 1;
      } else if (component.type === 'heatShrinkSleeve') {
        const key = `热收缩套-${diaDisplay}`;
        devices[key] = (devices[key] || 0) + 1;
      }
    });

    return devices;
  }, [components]);

  // 侧边栏统计结果使用 useMemo，避免在无关渲染时创建新对象
  const lengthsMemo = useMemo(() => calculateLengthsByType(), [calculateLengthsByType]);
  const fittingsMemo = useMemo(() => calculateFittings(), [calculateFittings]);
  const devicesMemo = useMemo(() => calculateDevicesByType(), [calculateDevicesByType]);

  // 当前视图的标注偏移（系统图/平面图互不影响）
  const effectiveLabelOffsets = useMemo(() => (
    viewMode === 'plane' ? (labelOffsetsPlane || {}) : (labelOffsetsSystem || {})
  ), [viewMode, labelOffsetsPlane, labelOffsetsSystem]);

  /**
   * 导出统计数据为 Excel/CSV 格式
   */
  const exportStatistics = useCallback(() => {
    // 创建CSV格式的数据
    let csvContent = '\uFEFF'; // BOM for UTF-8
    
    // 管材长度统计
    csvContent += '管材长度统计\n';
    csvContent += '规格,长度(m)\n';
    Object.entries(lengthsMemo || {}).forEach(([spec, length]) => {
      csvContent += `${spec},${length.toFixed ? length.toFixed(2) : length}\n`;
    });
    csvContent += '\n';

    // 管件数量统计
    csvContent += '管件数量统计\n';
    csvContent += '类型,数量\n';
    Object.entries(fittingsMemo || {}).forEach(([type, count]) => {
      csvContent += `${type},${count}\n`;
    });
    csvContent += '\n';

    // 设备数量统计
    csvContent += '设备数量统计\n';
    csvContent += '类型,数量\n';
    Object.entries(devicesMemo || {}).forEach(([type, count]) => {
      csvContent += `${type},${count}\n`;
    });
    csvContent += '\n';

    csvContent += `导出时间,${new Date().toLocaleString('zh-CN')}\n`;

    // 创建并下载文件
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `管道统计数据_${new Date().toISOString().slice(0, 10)}.csv`;
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
  }, [lengthsMemo, fittingsMemo, devicesMemo]);

  // 新增：导出图纸（PNG），包含标注与工程名
  const [drawingPreview, setDrawingPreview] = useState(null);
  const [drawingExportReady, setDrawingExportReady] = useState(false); // Track if drawing export is ready for preview
  const [showDrawingPreviewModal, setShowDrawingPreviewModal] = useState(false); // Control modal visibility
  const [previewTransparent, setPreviewTransparent] = useState(false);
  const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  const exportDrawing = useCallback(async () => {
    // Reset export ready state
    setDrawingExportReady(false);
    setShowDrawingPreviewModal(false);
    
    // Show progress toast with disabled Preview button and close button
    const progressToastId = showToast({
      type: 'info',
      title: '导出图纸',
      message: '正在渲染预览图片...',
      progress: 0,
      sticky: true,
      manualClose: true, // Add close button
      actions: [
        {
          label: '预览',
          style: 'button',
          disabled: true,
          onClick: () => {
            // This will be enabled later when export is ready
          }
        }
      ]
    });
    
    try {
      const title = (currentProject?.name || '未命名工程');
      const suffix = viewMode === 'plane' ? '——平面图' : '——系统图';
      const titleWithSuffix = `${title}${suffix}`;
      
      // Update progress: starting low-res render
      updateToast(progressToastId, {
        progress: 20,
        message: '正在渲染预览图片...'
      });
      
      // Render low-res version (1x) for quick preview
      const lowResBlob = await canvasViewRef.current?.exportImage(titleWithSuffix, 1);
      if (!lowResBlob) {
        dismissToast(progressToastId);
        setDrawingExportReady(false);
        return;
      }
      
      // Update progress: low-res rendered
      updateToast(progressToastId, {
        progress: 50,
        message: '预览图生成完成，正在生成高清版本...'
      });
      
      // Start high-res render (2x) in background for save/share
      const highResPromise = canvasViewRef.current?.exportImage(titleWithSuffix, 2);
      
      // Process low-res for preview
      const isTrial = (licenseVersion === 'trial');
      let finalLowResBlob = lowResBlob;
      
      if (isTrial) {
        try {
          const urlSrc = URL.createObjectURL(lowResBlob);
          const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = (err) => reject(err);
            i.src = urlSrc;
          });
          try {
            const cvs = document.createElement('canvas');
            cvs.width = img.width;
            cvs.height = img.height;
            const ctx = cvs.getContext('2d');
            ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
            const scaleForWatermark = (globalThis.devicePixelRatio || 1) * 1;
            await applyWatermarkToCanvas(cvs, { wmText: 'FENG XIAO', bottomLines: ['intpfx@icloud.com', 'https://github.com/intpfx'], scale: scaleForWatermark });
            finalLowResBlob = await new Promise((resolve) => cvs.toBlob((b) => { URL.revokeObjectURL(urlSrc); resolve(b || lowResBlob); }, 'image/png'));
          } catch (e) {
            URL.revokeObjectURL(urlSrc);
            finalLowResBlob = lowResBlob;
          }
        } catch (e) {
          finalLowResBlob = lowResBlob;
        }
      }
      
      // Prepare low-res preview variants
      const srcUrl = URL.createObjectURL(finalLowResBlob);
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = (err) => reject(err);
        i.src = srcUrl;
      });

      const cvs = document.createElement('canvas');
      cvs.width = img.width;
      cvs.height = img.height;
      const ctx = cvs.getContext('2d');

      // white background variant (low-res for preview)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
      const whiteBlob = await new Promise((resolve) => cvs.toBlob((b) => resolve(b), 'image/png'));
      const whiteUrl = URL.createObjectURL(whiteBlob || finalLowResBlob);

      // transparent variant (low-res for preview)
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
      const transBlob = await new Promise((resolve) => cvs.toBlob((b) => resolve(b), 'image/png'));
      const transUrl = URL.createObjectURL(transBlob || finalLowResBlob);

      URL.revokeObjectURL(srcUrl);
      
      // Update progress: low-res complete
      updateToast(progressToastId, {
        progress: 90,
        message: '预览图已就绪，高清版本生成中...'
      });
      
      // Wait for high-res to complete in background
      const highResBlob = await highResPromise;
      let finalHighResBlob = highResBlob;
      
      if (highResBlob && isTrial) {
        try {
          const urlSrc = URL.createObjectURL(highResBlob);
          const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = (err) => reject(err);
            i.src = urlSrc;
          });
          try {
            const cvs = document.createElement('canvas');
            cvs.width = img.width;
            cvs.height = img.height;
            const ctx = cvs.getContext('2d');
            ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
            const scaleForWatermark = (globalThis.devicePixelRatio || 1) * 2;
            await applyWatermarkToCanvas(cvs, { wmText: 'FENG XIAO', bottomLines: ['intpfx@icloud.com', 'https://github.com/intpfx'], scale: scaleForWatermark });
            finalHighResBlob = await new Promise((resolve) => cvs.toBlob((b) => { URL.revokeObjectURL(urlSrc); resolve(b || highResBlob); }, 'image/png'));
          } catch (e) {
            URL.revokeObjectURL(urlSrc);
            finalHighResBlob = highResBlob;
          }
        } catch (e) {
          finalHighResBlob = highResBlob;
        }
      }
      
      // Prepare high-res variants for save/share
      let highResWhiteBlob = finalHighResBlob;
      let highResTransBlob = finalHighResBlob;
      
      if (finalHighResBlob) {
        try {
          const srcUrl = URL.createObjectURL(finalHighResBlob);
          const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = (err) => reject(err);
            i.src = srcUrl;
          });

          const cvs = document.createElement('canvas');
          cvs.width = img.width;
          cvs.height = img.height;
          const ctx = cvs.getContext('2d');

          // white background variant (high-res for save)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cvs.width, cvs.height);
          ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
          highResWhiteBlob = await new Promise((resolve) => cvs.toBlob((b) => resolve(b), 'image/png'));

          // transparent variant (high-res for save)
          ctx.clearRect(0, 0, cvs.width, cvs.height);
          ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
          highResTransBlob = await new Promise((resolve) => cvs.toBlob((b) => resolve(b), 'image/png'));

          URL.revokeObjectURL(srcUrl);
        } catch (e) {
          console.warn('[App] Failed to process high-res variants', e);
        }
      }

      // Revoke previous preview URLs if any
      if (drawingPreview && drawingPreview.urls) {
        try { URL.revokeObjectURL(drawingPreview.urls.white); } catch (e) {}
        try { URL.revokeObjectURL(drawingPreview.urls.transparent); } catch (e) {}
      }

      setPreviewTransparent(false);
      setDrawingPreview({ 
        urls: { white: whiteUrl, transparent: transUrl }, 
        blobs: { white: whiteBlob || finalLowResBlob, transparent: transBlob || finalLowResBlob },
        highResBlobs: { white: highResWhiteBlob || finalHighResBlob, transparent: highResTransBlob || finalHighResBlob },
        filename: `${titleWithSuffix}_${new Date().toISOString().slice(0,10)}.png` 
      });
      
      // Enable preview button and update toast
      setDrawingExportReady(true);
      updateToast(progressToastId, {
        progress: 100,
        message: '图纸已准备就绪',
        actions: [
          {
            label: '预览',
            style: 'button',
            disabled: false,
            onClick: () => {
              // Open preview modal when clicked
              setShowDrawingPreviewModal(true);
            }
          }
        ]
      });
    } catch (e) {
      console.error('导出图纸失败：', e);
      dismissToast(progressToastId);
      setDrawingExportReady(false);
      showToast({
        type: 'error',
        title: '导出失败',
        message: '图纸导出过程中出现错误',
        duration: 3000
      });
    }
  }, [currentProject, viewMode, showToast, updateToast, dismissToast, drawingPreview, licenseVersion]);

  // 捕获指定视图的导出图片 blob（供外部调用，用于组合导出）
  const captureView = useCallback(async (targetViewMode, titleSuffix) => {
    try {
      const prev = viewMode;
      setViewMode(targetViewMode);
      // wait a couple of frames for canvas to re-render
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 60)));
      const title = `${currentProject?.name || '未命名工程'}${titleSuffix || ''}`;
      const blob = await canvasViewRef.current?.exportImage?.(title, 2);
      // restore previous view mode
      setViewMode(prev);
      return blob;
    } catch (e) {
      console.error('[App] captureView failed', e);
      try { setViewMode(prev); } catch (_) {}
      return null;
    }
  }, [canvasViewRef, currentProject, viewMode, setViewMode]);

  // Function to show drawing preview (called by Preview button)
  const showDrawingPreview = useCallback(() => {
    // Preview modal will be shown by rendering {drawingPreview && ...} in JSX
    // The modal is already set up below, we just need drawingPreview to be non-null
  }, []);

  /**
   * 在当前点绘制铜阀
   */
  /* eslint-disable-next-line no-unused-vars */
  const drawCopperValveAtCurrentPoint = () => {
    addComponent('copperValve');
  };

  /**
   * 在当前点绘制电磁阀
   */
  /* eslint-disable-next-line no-unused-vars */
  const drawExplosionProofValveAtCurrentPoint = () => {
    addComponent('explosionProofValve');
  };

  return (
    <div id="gm-app-root" className="h-screen w-screen flex flex-col bg-gray-100">
      <BlockOverlay
        id="gm-block-overlay"
        visible={false}
        requirePortrait
        requireCoarsePointer
        maxWidth={600}
        onVisibilityChange={(v) => setBlocked(v)}
      />
      <div id="gm-main-layout" className="flex flex-1 overflow-hidden w-full">
        {/* 主要绘图区域 - Bento UI风格优化 */}
        <div id="gm-canvas-container" className="flex-1 flex flex-col relative">
          {/* 绘图区域 - Bento风格卡片 */}
          <div id="gm-canvas-area" className="flex-1 bg-gray-100 relative overflow-hidden">
            <div id="gm-canvas-card" className="w-full h-full bg-white rounded-xl shadow-sm overflow-hidden relative">
              {/* 侧边胶囊条由 Center 区域常驻显示 */}
              <CanvasView
                id="gm-main-canvas"
                ref={canvasViewRef}
                segments={segments}
                components={components}
                fittings={fittings}
                viewMode={viewMode}
                planViewModel={planViewModel}
                showLabels={showLabels}
                labelOffsets={effectiveLabelOffsets}
                scale={scale}
                canvasOffset={canvasOffset}
                setScale={setScale}
                setCanvasOffset={setCanvasOffset}
                designStartPoint={designStartPoint}
                currentPoint={currentPoint}
                selectedSegment={selectedSegment}
                selectedComponent={selectedComponent}
                selectedFitting={selectedFitting}
                selectedEndpoint={selectedEndpoint}
                uiMode={uiMode}
                onMoveComponent={onMoveComponent}
                onMoveComponentPlan={onMoveComponentPlan}
                onMoveFitting={onMoveFitting}
                onMoveFittingPlan={onMoveFittingPlan}
                onUpdateLabelOffsets={(next) => {
                  if (viewMode === 'plane') setLabelOffsetsPlane(next); else setLabelOffsetsSystem(next);
                }}
                onSelectionChange={(hit) => {
                  // 移动模式：允许选中设备组件/配件进行拖动
                  if (uiMode === 'move') {
                    if (hit?.component) {
                      setSelectedSegment(null);
                      setSelectedEndpoint(null);
                      setSelectedComponent(hit.component);
                      setSelectedFitting(null);
                    } else if (hit?.fitting) {
                      setSelectedSegment(null);
                      setSelectedEndpoint(null);
                      setSelectedComponent(null);
                      setSelectedFitting(hit.fitting);
                    } else {
                      setSelectedSegment(null);
                      setSelectedComponent(null);
                      setSelectedFitting(null);
                      setSelectedEndpoint(null);
                    }
                    return;
                  }
                  
                  // 绘制模式：根据是否有选中的插入设备类型决定行为
                  if (uiMode === 'draw') {
                    // 有选中的插入设备类型：执行插入操作
                    if (insertDeviceType) {
                      // 弯头插入：端点模式
                      if (insertDeviceType === 'elbow' && hit && hit.endpoint) {
                        const endpoint = hit.endpoint;
                        const ENDPOINT_EPS = 3;
                        const candidateSegments = segments.filter(seg => {
                          if (!seg) return false;
                          const nearStart = Math.hypot(endpoint.x - seg.startPoint.x, endpoint.y - seg.startPoint.y) <= ENDPOINT_EPS;
                          const nearEnd = Math.hypot(endpoint.x - seg.endPoint.x, endpoint.y - seg.endPoint.y) <= ENDPOINT_EPS;
                          return nearStart || nearEnd;
                        });
                        if (candidateSegments.length === 0) {
                          if (typeof showToast === 'function') {
                            showToast({
                              type: 'warning',
                              title: '无法插入弯头',
                              message: '未找到与该端点相连的管段，请检查端点位置。',
                              duration: 2800,
                              manualClose: true
                            });
                          }
                          return;
                        }
                        if (candidateSegments.length > 1) {
                          if (typeof showToast === 'function') {
                            showToast({
                              type: 'warning',
                              title: '无法插入弯头',
                              message: '该端点连接了多根管线，无法在此处插入弯头。',
                              duration: 2800,
                              manualClose: true
                            });
                          }
                          return;
                        }
                        const seg = candidateSegments[0];
                        const nearStart = Math.hypot(endpoint.x - seg.startPoint.x, endpoint.y - seg.startPoint.y) <= ENDPOINT_EPS;
                        const elbowOpts = insertOptions?.elbow || {};
                        const elbowKind = elbowOpts.kind || '等径';
                        const elbowBranchDia = elbowKind === '异径' ? (elbowOpts.branchDiameter || null) : null;
                        addFittingWithExtras('elbow', {
                          segmentId: seg.id,
                          x: endpoint.x,
                          y: endpoint.y,
                          attachEndpoint: nearStart ? 'start' : 'end',
                          elbowKind,
                          branchDiameter: elbowBranchDia
                        });
                        return;
                      }
                      
                      // 线段上插入设备
                      if (hit && hit.segment && hit.segmentPoint) {
                        if (insertDeviceType === 'elbow') {
                          const seg = hit.segment;
                          const pt = hit.segmentPoint;
                          const ENDPOINT_EPS = 3;
                          const nearStart = Math.hypot(pt.x - seg.startPoint.x, pt.y - seg.startPoint.y) <= ENDPOINT_EPS;
                          const nearEnd = Math.hypot(pt.x - seg.endPoint.x, pt.y - seg.endPoint.y) <= ENDPOINT_EPS;
                          if (!nearStart && !nearEnd) {
                            if (typeof showToast === 'function') {
                              showToast({
                                type: 'warning',
                                title: '无法插入弯头',
                                message: '弯头只能插入到管线端点，请选择端点位置。',
                                duration: 2800,
                                manualClose: true
                              });
                            }
                            return;
                          }
                          const elbowOpts = insertOptions?.elbow || {};
                          const elbowKind = elbowOpts.kind || '等径';
                          const elbowBranchDia = elbowKind === '异径' ? (elbowOpts.branchDiameter || null) : null;
                          addFittingWithExtras('elbow', {
                            segmentId: seg.id,
                            x: pt.x,
                            y: pt.y,
                            attachEndpoint: nearStart ? 'start' : 'end',
                            elbowKind,
                            branchDiameter: elbowBranchDia
                          });
                          return;
                        }
                        
                        if (insertDeviceType === 'tee') {
                          const seg = hit.segment;
                          const extras = {};
                          const teeOpts = insertOptions?.tee || {};
                          extras.teeKind = teeOpts.kind || teeOpts.teeKind || '等径';
                          extras.branchDiameter = teeOpts.branchDiameter || null;
                          extras.segmentId = seg.id;
                          extras.x = hit.segmentPoint.x;
                          extras.y = hit.segmentPoint.y;
                          addFittingWithExtras('tee', extras);
                          return;
                        }

                        const SEGMENT_TYPES = ['copperValve','flangeValve','explosionProofValve','meter','regulator','pillar','junction','blockage','heatShrinkSleeve'];
                        if (SEGMENT_TYPES.includes(insertDeviceType)) {
                          const extras = {};
                          if (insertDeviceType === 'meter') {
                            extras.meterSpec = (insertOptions?.meterSpec) || selectedMeterType;
                            if (insertOptions?.meterSide) extras.meterSide = insertOptions.meterSide;
                          }
                          if (insertDeviceType === 'regulator') extras.regulatorSpec = (insertOptions?.regulatorSpec) || selectedRegulatorType;
                          if (insertDeviceType === 'pillar') {
                            const p = insertOptions?.pillar;
                            if (p) {
                              if (p.diameter) extras.diameter = p.diameter;
                              if (typeof p.height === 'number') extras.height = p.height;
                              if (typeof p.quantity === 'number') extras.quantity = p.quantity;
                            }
                          }
                          if (insertDeviceType === 'junction') {
                            const v = (insertOptions?.junctionId || '').trim();
                            if (!v) {
                              alert('接驳点ID不能为空');
                              return;
                            }
                            const exists = (components || []).some(c => c?.type === 'junction' && String(c?.junctionId || '').trim() === v);
                            if (exists) {
                              alert('接驳点ID已存在，请更换一个ID以避免冲突');
                              return;
                            }
                            extras.junctionId = v;
                          }
                          extras.segmentId = hit.segment.id;
                          insertDeviceWithConstraints(insertDeviceType, hit.segmentPoint.x, hit.segmentPoint.y, extras);
                          return;
                        }
                      }
                      
                      // 平面类型插入
                      if (hit && hit.worldPoint && ['room','door','window'].includes(insertDeviceType)) {
                        const { x: wx, y: wy } = hit.worldPoint;
                        if (insertDeviceType === 'window' || insertDeviceType === 'door') {
                          const room = findNearestRoom(wx, wy);
                          if (!room) {
                            alert('请先绘制房间，窗/门只能插入在墙体');
                            return;
                          }
                          const clamped = clampPointToRoomWall(wx, wy, room);
                          if (!clamped) {
                            alert('房间墙体过薄或房间过小，无法插入窗/门');
                            return;
                          }
                          addComponentAtPoint(insertDeviceType, clamped.x, clamped.y, { roomId: room.id, wallSide: clamped.side, wallPos: clamped.t });
                          return;
                        }
                        addComponentAtPoint(insertDeviceType, wx, wy, {});
                        return;
                      }
                      
                      // 有insertDeviceType但未命中可插入位置时，仍移动当前点
                      if (hit && hit.segment && hit.segmentPoint) {
                        setCurrentPoint(hit.segmentPoint);
                        saveCurrentProjectDebounced && saveCurrentProjectDebounced();
                      }
                      return;
                    }
                    
                    // 没有选中的插入设备类型：点击设备/配件/线段弹出属性面板
                    // 点击设备：选中并显示属性
                    if (hit?.component) {
                      setSelectedSegment(null);
                      setSelectedEndpoint(null);
                      setSelectedComponent(hit.component);
                      setSelectedFitting(null);
                      return;
                    }
                    // 点击配件：选中并显示属性
                    if (hit?.fitting) {
                      setSelectedSegment(null);
                      setSelectedEndpoint(null);
                      setSelectedComponent(null);
                      setSelectedFitting(hit.fitting);
                      return;
                    }
                    // 点击线段：选中并显示属性
                    if (hit?.segment) {
                      setSelectedSegment(hit.segment);
                      setSelectedComponent(null);
                      setSelectedFitting(null);
                      setSelectedEndpoint(null);
                      // 同时移动当前点到点击位置
                      if (hit.segmentPoint) {
                        setCurrentPoint(hit.segmentPoint);
                      }
                      saveCurrentProjectDebounced && saveCurrentProjectDebounced();
                      return;
                    }
                    // 点击端点
                    if (hit?.endpoint) {
                      setSelectedEndpoint(hit.endpoint);
                      setCurrentPoint(hit.endpoint);
                      setSelectedSegment(null);
                      setSelectedComponent(null);
                      setSelectedFitting(null);
                      return;
                    }
                    // 点击空白处：清空选中
                    setSelectedSegment(null);
                    setSelectedComponent(null);
                    setSelectedFitting(null);
                    setSelectedEndpoint(null);
                    return;
                  }
                  
                  // 其他模式的默认处理
                  const nextSegment = hit && hit.endpoint ? null : (hit?.segment || null);
                  setSelectedSegment(nextSegment);
                  setSelectedComponent(hit?.component || null);
                  setSelectedFitting(hit?.fitting || null);
                  if (hit && hit.endpoint) {
                    setSelectedEndpoint(hit.endpoint);
                    setCurrentPoint(hit.endpoint);
                  } else {
                    setSelectedEndpoint(null);
                  }
                }}
                onSaveImmediate={saveCurrentProject}
                onSaveDebounced={saveCurrentProjectDebounced}
                interactionEnabled={!blocked}
              />
              {/* 图纸导出预览弹窗（点击导出图纸后显示） */}
              {drawingPreview && showDrawingPreviewModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000010, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => {
                    setShowDrawingPreviewModal(false);
                  }}>
                  <div style={{ position: 'relative', background: prefersDark ? 'rgba(15,23,42,0.98)' : '#ffffff', borderRadius: 12, padding: 18, maxWidth: '94%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ maxHeight: '80vh', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                      <div style={{ background: previewTransparent ? 'repeating-linear-gradient(45deg, #e6e6e6 0 10px, #cfcfcf 0 20px)' : '#ffffff', padding: 6, borderRadius: 6 }}>
                        <img src={(drawingPreview.urls && drawingPreview.urls[previewTransparent ? 'transparent' : 'white']) || (drawingPreview.urls && drawingPreview.urls.white)} alt="图纸导出预览" style={{ display: 'block', width: '100%', maxWidth: 1200, borderRadius: 6, border: `1px solid ${prefersDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.6)'}` }} />
                      </div>
                    </div>

                    {/* Controls: two rows under the image (iOS settings style) */}
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 1200, width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: prefersDark ? 'rgba(2,6,23,0.04)' : 'transparent' }}>
                        <div style={{ fontSize: 14, color: prefersDark ? '#e5e7eb' : '#0f172a' }}>透明背景</div>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', height: 40 }}>
                          <input type="checkbox" checked={previewTransparent} onChange={(e) => setPreviewTransparent(!!e.target.checked)} style={{ display: 'none' }} />
                          <span style={{ width: 60, height: 40, borderRadius: 9999, background: previewTransparent ? '#3b82f6' : '#e5e7eb', position: 'relative', display: 'inline-block', transition: 'background 0.18s' }}>
                            <span style={{ position: 'absolute', top: 4, left: previewTransparent ? 28 : 4, width: 32, height: 32, borderRadius: 9999, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 0.18s' }} />
                          </span>
                        </label>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: prefersDark ? 'rgba(2,6,23,0.04)' : 'transparent' }}>
                        <div style={{ fontSize: 14, color: prefersDark ? '#e5e7eb' : '#0f172a' }}>保存为图片</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={() => {
                            const key = previewTransparent ? 'transparent' : 'white';
                            // Use high-res blob for saving
                            const highResBlob = drawingPreview.highResBlobs && drawingPreview.highResBlobs[key];
                            if (highResBlob) {
                              const url = URL.createObjectURL(highResBlob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = drawingPreview.filename;
                              a.click();
                              URL.revokeObjectURL(url);
                            } else {
                              // Fallback to preview URL if high-res not available
                              const url = drawingPreview.urls && drawingPreview.urls[key] ? drawingPreview.urls[key] : (drawingPreview.urls && drawingPreview.urls.white) || '';
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = drawingPreview.filename;
                              a.click();
                            }
                            try { URL.revokeObjectURL(drawingPreview.urls.white); } catch (e) {}
                            try { URL.revokeObjectURL(drawingPreview.urls.transparent); } catch (e) {}
                            setDrawingPreview(null);
                          }} style={{ height: 40, padding: '0 14px', borderRadius: 9999, border: 'none', background: prefersDark ? '#1e40af' : '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>保存</button>
                        </div>
                      </div>

                      {/* Share row as the last row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 9999, background: prefersDark ? 'rgba(2,6,23,0.04)' : 'transparent' }}>
                        <div style={{ fontSize: 14, color: prefersDark ? '#e5e7eb' : '#0f172a' }}>分享</div>
                        <div>
                          <button type="button" onClick={async () => {
                            try {
                              const key = previewTransparent ? 'transparent' : 'white';
                              // Use high-res blob for sharing
                              const highResBlob = drawingPreview.highResBlobs && drawingPreview.highResBlobs[key];
                              const blob = highResBlob || (drawingPreview.blobs && (drawingPreview.blobs[key] || drawingPreview.blobs.white)) || null;
                              const url = drawingPreview.urls && (drawingPreview.urls[key] || drawingPreview.urls.white) || '';
                              const filename = drawingPreview.filename || `设计_${new Date().toISOString().slice(0,10)}.png`;
                              if (blob && typeof navigator !== 'undefined' && navigator.share) {
                                try {
                                  const file = new File([blob], filename, { type: blob.type || 'image/png' });
                                  if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                                    await navigator.share({ files: [file], title: filename });
                                  } else {
                                    await navigator.share({ title: filename, url });
                                  }
                                  if (typeof showToast === 'function') {
                                    showToast({ type: 'success', title: '已分享', message: '已打开系统分享菜单', duration: 2200 });
                                  }
                                } catch (err) {
                                  try {
                                    if (navigator.clipboard && window.ClipboardItem) {
                                      await navigator.clipboard.write([new window.ClipboardItem({ [blob.type || 'image/png']: blob })]);
                                      if (typeof showToast === 'function') showToast({ type: 'success', title: '已复制', message: '图片已复制到剪贴板', duration: 2200 });
                                    } else {
                                      window.open(url, '_blank', 'noopener,noreferrer');
                                    }
                                  } catch (_) {
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  }
                                }
                              } else {
                                window.open(url, '_blank', 'noopener,noreferrer');
                              }
                            } catch (e) {}
                          }} style={{ height: 40, padding: '0 14px', borderRadius: 9999, border: 'none', background: prefersDark ? '#d2b11cff' : '#ef9b00ff', color: prefersDark ? '#e2e8f0' : '#111827', cursor: 'pointer', fontWeight: 700 }}>分享</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 使用 LiveDock（Top/Center/Bottom） */}
      <LiveDock
        bottomProps={{
          selectedDirection,
          selectedMaterial,
          selectedDiameter,
          selectedSegment,
          selectedComponent,
          selectedFitting,
          pipelineStats: selectedPipelineStats,
          selectedMeterType,
          onDirectionChange: handleDirectionChange,
          onMaterialChange: handleMaterialChange,
          onDiameterChange: handleDiameterChange,
          onCreateSegment: createNewSegment,
          onExtendSegment: extendCurrentSegment,
          onUpdateSegment: updateSelectedSegment,
          onSetChainValveCount: setChainValveCount,
          onCommitSegmentEdits: commitSegmentEdits,
          onToggleTerminalBallValve: handleToggleTerminalBallValve,
          onToggleIotMeter: handleToggleIotMeter,
          onCycleMeterType: handleCycleMeterType,
          onCycleIotMeterCombined: handleCycleIotMeterCombined,
          onCycleRegulatorCombined: handleCycleRegulatorCombined,
          onAutoInsertRegulator: insertRegulatorAutoAlign,
          onDeleteSelected: deleteSelected,
          onDeleteComponent: (component) => {
            setComponents(prev => prev.filter(c => c.id !== component.id));
            setSelectedComponent(null);
            saveCurrentProject();
          },
          onDeleteFitting: (fitting) => {
            setFittings(prev => prev.filter(f => f.id !== fitting.id));
            setSelectedFitting(null);
            saveCurrentProject();
          },
          onDeleteSegment: (segment) => {
            const threshold = 3;
            const onSeg = (x, y) => pointDistanceToSegment(x, y, segment.startPoint.x, segment.startPoint.y, segment.endPoint.x, segment.endPoint.y) <= threshold;
            setSegments(prev => prev.filter(s => s.id !== segment.id));
            setComponents(prev => prev.filter(c => !onSeg(c.x, c.y)));
            setFittings(prev => prev.filter(f => !onSeg(f.x, f.y)));
            setSelectedSegment(null);
            setSelectedComponent(null);
            setSelectedFitting(null);
            setSelectedEndpoint(null);
            saveCurrentProject();
          },
          hasCurrentPoint: !!currentPoint,
          hasSegments: segments.length > 0,
          forbiddenDirectionIndices,
          onNudgeSelected,
          distance,
          onSetDistance: (val) => setDistance(val),
        }}
        centerProps={{
          scale,
          onZoomIn,
          onZoomOut,
          onReset: resetScale,
          onCenter: centerToCurrentPoint,
          lengths: lengthsMemo,
          fittings: fittingsMemo,
          devices: devicesMemo,
          showLabels,
          onToggleLabels: toggleLabels,
          onExportStatistics: exportStatistics,
          onExportDrawing: exportDrawing,
          onCaptureView: captureView,
          drawingExportReady,
          onShowDrawingPreview: showDrawingPreview,
        }}
        showTop={true}
        showCenter={true}
        showBottom={true}
      />
    </div>
  );
};

/**
 * App 根组件：作为 ProjectProvider 的包装器，仅渲染 AppContent。
 * 该组件不包含绘图或其他 UI 逻辑。
 */
const App = () => {
  return (
    <ProjectProvider>
      <ToastProvider>
        <AppContent />
        <AddToHomeScreen />
      </ToastProvider>
    </ProjectProvider>
  );
};

export default App;