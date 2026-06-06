/**
 * Pipeline calculations utility
 * 管道计算工具函数
 * 
 * Extracted from App.jsx to improve maintainability
 */

import { normalizeMaterialGroup, parseDiameterNumeric, formatDiameterForDisplay, formatDiameterAsDN } from './pipelineSpec.js';
import { pointDistanceToSegment as pointDistToSeg, pointsEqual as ptsEqual, degDiff as degDifference } from './geometry.js';

// Re-export geometry functions for backward compatibility
export const pointDistanceToSegment = pointDistToSeg;
export const pointsEqual = ptsEqual;
export const degDiff = degDifference;

/**
 * Calculate fittings based on segment connections
 * 根据连接关系计算管件数量
 * 
 * @param {Object} params - Calculation parameters
 * @param {Array} params.segments - Array of pipe segments
 * @param {Array} params.manualFittings - Manually added fittings
 * @param {Array} params.components - Components array
 * @param {Array} params.fittings - Fittings array  
 * @returns {Object} Object with fitting type as key and count as value
 */
export const calculateFittingsByConnections = ({
  segments,
  manualFittings = [],
  components = [],
  fittings = []
}) => {
  const counts = {};
  
  // Build endpoint -> incident segments map
  const nodeMap = new Map();
  const keyOf = (p) => `${p.x},${p.y}`;
  
  segments.forEach(seg => {
    const addInc = (ptFrom, ptTo) => {
      const vx = ptTo.x - ptFrom.x;
      const vy = ptTo.y - ptFrom.y;
      let angle = (Math.atan2(vy, vx) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      const list = nodeMap.get(keyOf(ptFrom)) || [];
      list.push({ material: seg.material, diameter: seg.diameter, angle });
      nodeMap.set(keyOf(ptFrom), list);
    };
    addInc(seg.startPoint, seg.endPoint);
    addInc(seg.endPoint, seg.startPoint);
  });

  // Detect mid-segment branches (virtual nodes)
  const NODE_EPS = 3;
  const virtualNodeMap = new Map();
  
  const projectPointToSegment = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return { x: x1, y: y1 };
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const tt = Math.max(0, Math.min(1, t));
    return { x: x1 + tt * dx, y: y1 + tt * dy };
  };
  
  const nearPoint = (p, q, eps = NODE_EPS) => Math.hypot(p.x - q.x, p.y - q.y) <= eps;
  
  const addVirtualInc = (pt, material, diameter, angle) => {
    const key = `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
    const list = virtualNodeMap.get(key) || [];
    list.push({ material, diameter, angle });
    virtualNodeMap.set(key, list);
  };

  // Scan for endpoints landing on mid-segments
  for (let i = 0; i < segments.length; i++) {
    const A = segments[i];
    for (let j = 0; j < segments.length; j++) {
      if (i === j) continue;
      const B = segments[j];
      const endpointsB = [B.startPoint, B.endPoint];
      
      for (const e of endpointsB) {
        const d = pointDistanceToSegment(e.x, e.y, A.startPoint.x, A.startPoint.y, A.endPoint.x, A.endPoint.y);
        if (d > NODE_EPS) continue;
        
        const P = projectPointToSegment(e.x, e.y, A.startPoint.x, A.startPoint.y, A.endPoint.x, A.endPoint.y);
        if (nearPoint(P, A.startPoint) || nearPoint(P, A.endPoint)) continue;
        
        const anglePA = (ptTo) => {
          const vx = ptTo.x - P.x;
          const vy = ptTo.y - P.y;
          let ang = (Math.atan2(vy, vx) * 180) / Math.PI;
          if (ang < 0) ang += 360;
          return ang;
        };
        
        const angToAStart = anglePA(A.startPoint);
        const angToAEnd = anglePA(A.endPoint);
        const otherB = (pointsEqual(e, B.startPoint) ? B.endPoint : B.startPoint);
        const angToBOther = anglePA(otherB);
        
        addVirtualInc(P, A.material, A.diameter, angToAStart);
        addVirtualInc(P, A.material, A.diameter, angToAEnd);
        addVirtualInc(P, B.material, B.diameter, angToBOther);
      }
    }
  }

  // Helper to create fitting labels
  const incLabel = (group, type, a, b, opts = {}) => {
    const matLabel = group === 'galvanized' ? '镀锌' : group === 'steel' ? '钢制' : '';
    const base = matLabel ? `${matLabel}${type}` : type;
    const ensureString = (v) => (v == null ? '' : String(v).trim());
    
    const formatSpec = (rawSpec) => {
      const spec = ensureString(rawSpec);
      if (!spec) return '';
      const ctx = { ...(opts.formatContext || {}) };
      if (!ctx.material && !ctx.group) {
        if (group === 'galvanized' || group === 'steel') ctx.group = group;
        if (opts.material) ctx.material = opts.material;
        if (opts.componentType) ctx.componentType = opts.componentType;
      }
      return formatDiameterForDisplay(spec, ctx);
    };
    
    const specA = formatSpec(a);
    const specB = formatSpec(b);
    let pair = '';
    if (specA && specB) {
      pair = specA === specB ? specA : `${specA}/${specB}`;
    } else {
      pair = specA || specB || '';
    }
    return pair ? `${base} ${pair}`.trim() : base;
  };

  const bump = (label) => {
    counts[label] = (counts[label] || 0) + 1;
  };

  // Process nodes to determine fittings
  const processNodeIncs = (incs) => {
    if (!Array.isArray(incs) || incs.length < 2) return;

    // Handle tees (3 connections)
    if (incs.length === 3) {
      const ANGLE_MERGE_TOL = 3;
      const STRAIGHT_TOL_TEE = 15;
      
      // Merge similar directions
      const mergeByAngle = (arr, tolDeg) => {
        const sorted = [...arr].sort((a, b) => a.angle - b.angle);
        const out = [];
        for (const item of sorted) {
          if (out.length === 0) {
            out.push({ ...item });
            continue;
          }
          const prev = out[out.length - 1];
          const isSameDir = degDiff(prev.angle, item.angle) <= tolDeg;
          const sameMat = normalizeMaterialGroup(prev.material) === normalizeMaterialGroup(item.material);
          const prevN = parseDiameterNumeric(prev.diameter);
          const curN = parseDiameterNumeric(item.diameter);
          if (isSameDir && sameMat) {
            out[out.length - 1] = curN >= prevN ? { ...item } : prev;
          } else {
            out.push({ ...item });
          }
        }
        return out;
      };
      
      let incsMerged = mergeByAngle(incs, ANGLE_MERGE_TOL);
      if (incsMerged.length !== 3) {
        incsMerged = incs;
      }

      // Find the pair closest to 180° as main trunk
      const angs = incsMerged.map(i => i.angle);
      const pairs = [
        { i: 0, j: 1, d: degDiff(angs[0], angs[1]) },
        { i: 0, j: 2, d: degDiff(angs[0], angs[2]) },
        { i: 1, j: 2, d: degDiff(angs[1], angs[2]) },
      ].sort((a, b) => Math.abs(180 - a.d) - Math.abs(180 - b.d));
      
      const main = pairs[0];
      const branchIdx = [0, 1, 2].find(k => k !== main.i && k !== main.j);
      const mainA = incsMerged[main.i];
      const mainB = incsMerged[main.j];
      const branch = incsMerged[branchIdx];

      const gA = normalizeMaterialGroup(mainA.material);
      const gB = normalizeMaterialGroup(mainB.material);
      const gBranch = normalizeMaterialGroup(branch.material);

      const nA = parseDiameterNumeric(mainA.diameter);
      const nB = parseDiameterNumeric(mainB.diameter);
      const mainDia = nA >= nB ? mainA.diameter : mainB.diameter;
      const branchDia = branch.diameter;

      // Same material tee
      if (gA && gA === gB && gA === gBranch) {
        const group = gA === 'pe' ? '' : gA;
        const type = gA === 'pe' ? '电熔三通' : '三通';
        bump(incLabel(group, type, mainDia, branchDia));
        return;
      }

      // Trunk same material, branch different
      if (gA && gA === gB) {
        const group = gA === 'pe' ? '' : gA;
        const type = gA === 'pe' ? '电熔三通' : '三通';
        bump(incLabel(group, type, mainDia, branchDia));
        
        const isSteelGroup = (g) => g === 'galvanized' || g === 'steel';
        if ((isSteelGroup(gA) && gBranch === 'pe') || (isSteelGroup(gBranch) && gA === 'pe')) {
          bump(incLabel('', '钢塑转换', branchDia, mainDia));
        }
        return;
      }

      // Mixed materials
      const majority = gBranch || gA || gB || '';
      const group = majority === 'pe' ? '' : majority;
      const type = majority === 'pe' ? '电熔三通' : '三通';
      bump(incLabel(group, type, mainDia, branchDia));
      
      const isSteelGroup = (g) => g === 'galvanized' || g === 'steel';
      if (gA && gB && gA !== gB) {
        if ((isSteelGroup(gA) && gB === 'pe') || (isSteelGroup(gB) && gA === 'pe')) {
          bump(incLabel('', '钢塑转换', mainA.diameter, mainB.diameter));
        }
      }
      if (gBranch && (gBranch !== gA || gBranch !== gB)) {
        if ((isSteelGroup(gBranch) && (gA === 'pe' || gB === 'pe')) || 
            ((isSteelGroup(gA) || isSteelGroup(gB)) && gBranch === 'pe')) {
          bump(incLabel('', '钢塑转换', branchDia, mainDia));
        }
      }
      return;
    }

    // Handle elbows/reducers (2 connections)
    if (incs.length === 2) {
      const i1 = incs[0];
      const i2 = incs[1];
      const g1 = normalizeMaterialGroup(i1.material);
      const g2 = normalizeMaterialGroup(i2.material);
      const diam1 = i1.diameter;
      const diam2 = i2.diameter;
      const dnum1 = parseDiameterNumeric(diam1);
      const dnum2 = parseDiameterNumeric(diam2);
      
      // Angle difference determines if this is a straight-through connection or an elbow
      // Straight-through: pipes aligned ~180° apart (e.g., 175°-185° range with 15° tolerance)
      // Elbow: pipes at other angles (e.g., 90° for a right-angle bend)
      const diff = degDiff(i1.angle, i2.angle);
      const STRAIGHT_TOL = 15; // Tolerance in degrees for straight-through detection
      const isStraightThrough = diff >= (180 - STRAIGHT_TOL);

      const isSteelGroup = (g) => g === 'galvanized' || g === 'steel';
      
      // Steel-PE transition
      if ((isSteelGroup(g1) && g2 === 'pe') || (isSteelGroup(g2) && g1 === 'pe')) {
        bump(incLabel('', '钢塑转换', diam1, diam2));
        return;
      }
      
      // Different materials (non-PE)
      if (g1 !== g2) {
        return;
      }

      // Same material
      const group = (g1 === 'galvanized' || g1 === 'steel') ? g1 : (g1 === 'pe' ? 'pe' : '');
      
      if (dnum1 !== dnum2) {
        const large = dnum1 >= dnum2 ? diam1 : diam2;
        const small = dnum1 >= dnum2 ? diam2 : diam1;
        
        if (isStraightThrough) {
          // Reducer
          if (group === 'pe') {
            bump(incLabel('', '电熔异径管', large, small));
          } else {
            bump(incLabel(group, '异径管', large, small));
          }
        } else {
          // Reducing elbow
          if (group === 'pe') {
            bump(incLabel('', '电熔弯头', large, null));
          } else {
            bump(incLabel(group, '弯头', large, null));
          }
        }
      } else {
        // Same diameter: straight-through no fitting, elbow needs fitting
        if (!isStraightThrough) {
          if (group === 'pe') {
            bump(incLabel('', '电熔弯头', diam1, null));
          } else {
            bump(incLabel(group, '弯头', diam1, null));
          }
        }
      }
      return;
    }
  };

  // Process all nodes
  nodeMap.forEach(processNodeIncs);
  virtualNodeMap.forEach(processNodeIncs);

  // Process explicit fittings
  (fittings || []).forEach(f => {
    if (!f || !f.type) return;
    
    if (f.type === 'tee') {
      const seg = segments.find(s => s.id === f.segmentId) || null;
      const g = seg ? normalizeMaterialGroup(seg.material) : '';
      const mainDia = seg ? seg.diameter : (f.mainDiameter || f.diameter || '');
      const kind = f.teeKind || f.kind || '等径';
      
      if (kind === '等径') {
        bump(incLabel(g, '三通', mainDia, null, {
          material: seg?.material,
          formatContext: { material: seg?.material, group: g }
        }));
      } else {
        const branchDia = f.branchDiameter || '';
        bump(incLabel(g, '三通', branchDia, mainDia, {
          material: seg?.material,
          formatContext: { material: seg?.material, group: g }
        }));
      }
      return;
    }
    
    if (f.type === 'elbow') {
      const seg = segments.find(s => s.id === f.segmentId) || null;
      const gRaw = seg ? normalizeMaterialGroup(seg.material) : '';
      const labelGroup = (gRaw === 'galvanized' || gRaw === 'steel') ? gRaw : '';
      const typeLabel = gRaw === 'pe' ? '电熔弯头' : '弯头';
      const mainDia = seg ? seg.diameter : (f.diameter || '');
      const elbowKind = f.elbowKind || '等径';
      const branchDia = elbowKind === '异径' ? (f.branchDiameter || '') : '';
      
      if (branchDia) {
        bump(incLabel(labelGroup, typeLabel, mainDia, branchDia, {
          material: seg?.material,
          formatContext: { material: seg?.material, group: gRaw }
        }));
      } else {
        bump(incLabel(labelGroup, typeLabel, mainDia, null, {
          material: seg?.material,
          formatContext: { material: seg?.material, group: gRaw }
        }));
      }
      return;
    }

    if (f.type === 'union') {
      // 活接：尝试使用其 segmentId 定位所属管段；若缺失则按几何位置寻找最近管段，
      // 以便统计时能根据实际所在管线材质进行分类（镀锌/钢制/电熔）。
      let seg = null;
      if (f.segmentId != null) seg = segments.find(s => s && s.id === f.segmentId) || null;
      if (!seg && segments && segments.length && typeof f.x === 'number' && typeof f.y === 'number') {
        let best = null; let bestD = Infinity;
        for (const s of segments) {
          if (!s) continue;
          const d0 = pointDistToSeg(f.x, f.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
          if (d0 < bestD) { bestD = d0; best = s; }
        }
        seg = best;
      }
      const gRaw = seg ? normalizeMaterialGroup(seg.material) : '';
      const diam = seg ? seg.diameter : (f.diameter || '');
      if (gRaw === 'pe') {
        bump(incLabel('', '电熔活接', diam, null, { material: seg?.material, formatContext: { material: seg?.material, group: gRaw } }));
      } else if (gRaw === 'galvanized' || gRaw === 'steel') {
        bump(incLabel(gRaw, '活接', diam, null, { material: seg?.material, formatContext: { material: seg?.material, group: gRaw } }));
      } else {
        bump(incLabel('', '活接', diam, null, { material: seg?.material, formatContext: { material: seg?.material, group: gRaw } }));
      }
      return;
    }
  });

  // Process manual fittings
  (manualFittings || []).forEach(item => {
    const name = item.type === 'pillar' ? '立柱' : 
                 item.type === 'bracket' ? (item.subType || '支撑') : 
                 (item.type || '配件');
    const spec = item.spec ? String(item.spec).trim() : '';
    const key = spec ? `${name}-${spec}` : name;
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    counts[key] = (counts[key] || 0) + qty;
    
    // U-clamps for brackets
    if (item.type === 'bracket' && item.subType === '支架') {
      const getUClampSpec = (pipeSpec) => {
        if (!pipeSpec) return '25';
        const diameter = parseInt(pipeSpec.replace(/\D/g, '')) || 15;
        if (diameter <= 15) return '25';
        if (diameter <= 25) return '32';
        if (diameter <= 32) return '40';
        if (diameter <= 40) return '50';
        return '50+';
      };
      
      const uClampSpec = getUClampSpec(item.pipeSpec || '15');
      const uClampKey = `U型卡-${uClampSpec}`;
      const uClampQty = qty * 2;
      counts[uClampKey] = (counts[uClampKey] || 0) + uClampQty;
    }
  });

  // Process pillar components
  (components || []).forEach(c => {
    if (c.type !== 'pillar') return;
    const rawSpec = (c.diameter || '').trim();
    const spec = formatDiameterAsDN(rawSpec);
    const qty = Math.max(0, Math.floor(Number(c.quantity) || 1));
    const key = spec ? `立柱-${spec}` : '立柱';
    counts[key] = (counts[key] || 0) + qty;
  });

  // Meter fittings
  const meterCount = (components || []).reduce((sum, c) => sum + (c.type === 'meter' ? 1 : 0), 0);
  if (meterCount > 0) {
    counts['防盗表接头'] = (counts['防盗表接头'] || 0) + meterCount;
    counts['普通表接头'] = (counts['普通表接头'] || 0) + meterCount;
  }

  return counts;
};
