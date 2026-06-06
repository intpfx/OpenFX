/**
 * Statistics service
 * 统计计算服务
 * 
 * Handles all statistics calculations for pipeline segments, fittings, and devices
 * Extracted from App.jsx for better maintainability and testability
 */

import { formatDiameterForDisplay } from '../utils/pipelineSpec.js';
import { pointDistanceToSegment, pointsEqual } from '../utils/geometry.js';
import { calculateFittingsByConnections } from '../utils/pipelineCalculations.js';

/**
 * Calculate total lengths by pipe type (material + diameter)
 * @param {Array} segments - Array of pipe segments
 * @param {Array} manualFittings - Array of manual fittings (includes pillars)
 * @param {Array} components - Array of components (includes pillars)
 * @returns {Object} Object with type as key and length as value
 */
export const calculateLengthsByType = (segments, manualFittings = [], components = []) => {
  const lengths = {};
  
  // Calculate segment lengths
  segments.forEach(segment => {
    const specDisplay = formatDiameterForDisplay(segment.diameter || '', { material: segment.material });
    const key = `${segment.material}-${specDisplay}`;
    if (!lengths[key]) {
      lengths[key] = 0;
    }
    lengths[key] += segment.length;
  });

  // Add pillar heights to galvanized steel pipe lengths
  (manualFittings || []).forEach(item => {
    const isPillar = (item.type === 'pillar') || (item.type === 'bracket' && item.subType === '立柱');
    if (!isPillar) return;
    const h = Number(item.height);
    if (!Number.isFinite(h) || h <= 0) return;
    // Spec priority: spec > diameter > default DN15
    const rawSpec = (item.spec || item.diameter || 'DN15').trim();
    const spec = formatDiameterForDisplay(rawSpec, { material: '镀锌钢管' });
    const quantity = Math.max(1, parseInt(item.quantity) || 1);
    const key = `镀锌钢管-${spec}`;
    lengths[key] = (lengths[key] || 0) + h * quantity;
  });

  // Add pillar component heights to galvanized steel pipe lengths
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
};

/**
 * Calculate device counts by type
 * @param {Array} components - Array of components
 * @returns {Object} Object with device type as key and count as value
 */
export const calculateDevicesByType = (components) => {
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
};

/**
 * Calculate fittings count (delegates to pipelineCalculations)
 * @param {Object} params - Parameters
 * @param {Array} params.segments - Array of segments
 * @param {Array} params.manualFittings - Array of manual fittings
 * @param {Array} params.components - Array of components
 * @param {Array} params.fittings - Array of fittings
 * @returns {Object} Object with fitting type as key and count as value
 */
export const calculateFittings = ({ segments, manualFittings, components, fittings }) => {
  return calculateFittingsByConnections({
    segments,
    manualFittings,
    components,
    fittings
  });
};

/**
 * Get connected chain of segments with same material
 * @param {Object} baseSeg - Base segment to start from
 * @param {Array} allSegments - All segments
 * @returns {Array} Array of connected segments
 */
export const getConnectedChain = (baseSeg, allSegments) => {
  if (!baseSeg) return [];
  const sameMaterialSegments = allSegments.filter(s => s.material === baseSeg.material);
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
 * Compute detailed statistics for a selected pipeline segment and its chain
 * @param {Object} seg - Selected segment
 * @param {Object} params - Parameters
 * @param {Array} params.segments - All segments
 * @param {Array} params.components - All components
 * @param {Array} params.fittings - All fittings
 * @param {Object} params.designStartPoint - Design start point {x, y}
 * @returns {Object|null} Statistics object or null
 */
export const computeSelectedPipelineStats = (seg, { segments, components, fittings, designStartPoint }) => {
  if (!seg) return null;
  
  const chain = getConnectedChain(seg, segments);
  const totalLength = chain.reduce((sum, s) => sum + (s.length || 0), 0);

  // Calculate endpoint degrees for determining free endpoints
  const degree = new Map();
  const pointKey = (p) => `${p.x},${p.y}`;
  const addDegree = (p) => degree.set(pointKey(p), (degree.get(pointKey(p)) || 0) + 1);
  chain.forEach(s => { addDegree(s.startPoint); addDegree(s.endPoint); });
  const endpoints = chain.flatMap(s => [s.startPoint, s.endPoint]).filter(p => (degree.get(pointKey(p)) || 0) === 1);

  // Calculate overall network degree to determine unconnected endpoints
  const degreeAll = new Map();
  const addDegreeAll = (p) => degreeAll.set(pointKey(p), (degreeAll.get(pointKey(p)) || 0) + 1);
  segments.forEach(s => { addDegreeAll(s.startPoint); addDegreeAll(s.endPoint); });
  const freeEndpointsOverall = endpoints.filter(ep => (degreeAll.get(pointKey(ep)) || 0) === 1);

  // Calculate free endpoints for selected segment only
  const selectedSegmentFreeEndpoints = [];
  if (seg) {
    const segmentEndpoints = [seg.startPoint, seg.endPoint];
    segmentEndpoints.forEach(ep => {
      if ((degreeAll.get(pointKey(ep)) || 0) === 1) {
        selectedSegmentFreeEndpoints.push(ep);
      }
    });
  }

  // Component and fitting detection
  const threshold = 3;
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

  // Check if chain connects to design start
  const nearDesignStart = (p) => Math.hypot(p.x - designStartPoint.x, p.y - designStartPoint.y) <= threshold;
  const chainConnectedToDesignStart = chain.some(s => nearDesignStart(s.startPoint) || nearDesignStart(s.endPoint));

  // Component counts
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

  const nearSelectedSegmentEndpoint = (x, y) => {
    if (!seg) return false;
    const segmentEndpoints = [seg.startPoint, seg.endPoint];
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

  // Fitting counts (brackets)
  let bracketCount = 0;
  for (const f of fittings) {
    if (!isOnChain(f.x, f.y)) continue;
    if (f.type === 'bracket') bracketCount += 1;
  }

  const middleCopperValves = Math.max(0, copperValveCount - endpointCopperValveCount);
  const middleFlangeValves = Math.max(0, flangeValveCount - endpointFlangeValveCount);

  const globalRegulatorInstalled = components.some(c => c.type === 'regulator');
  
  // Segment-level valve counts (middle valves only, excluding endpoints)
  let segmentCopperValves = 0;
  let segmentFlangeValves = 0;
  let segmentExplosionValves = 0;
  let segmentRegulatorCount = 0;
  let segmentRegulatorSpec = null;
  let segmentMeterCount = 0;
  let segmentMeterSpec = null;
  
  for (const c of components) {
    if (!isOnSelectedSegment(c.x, c.y)) continue;
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
