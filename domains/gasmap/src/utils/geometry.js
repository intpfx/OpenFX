/**
 * Geometry utilities
 * 几何计算工具函数
 * 
 * Pure geometry functions extracted from App.jsx for better testability and reusability.
 */

/**
 * Calculate the distance between two points
 * @param {Object} point1 - First point {x, y}
 * @param {Object} point2 - Second point {x, y}
 * @returns {number} Distance between points
 */
export const calculateDistance = (point1, point2) => {
  return Math.sqrt(
    Math.pow(point2.x - point1.x, 2) +
    Math.pow(point2.y - point1.y, 2)
  );
};

/**
 * Calculate the angle between two points
 * @param {Object} point1 - First point {x, y}
 * @param {Object} point2 - Second point {x, y}
 * @returns {number} Angle in radians
 */
export const calculateAngle = (point1, point2) => {
  return Math.atan2(point2.y - point1.y, point2.x - point1.x);
};

/**
 * Calculate end point based on start point, angle and distance
 * @param {Object} startPoint - Starting point {x, y}
 * @param {number} angle - Angle in radians
 * @param {number} distance - Distance
 * @returns {Object} End point {x, y}
 */
export const calculateEndPoint = (startPoint, angle, distance) => {
  return {
    x: startPoint.x + Math.cos(angle) * distance,
    y: startPoint.y + Math.sin(angle) * distance
  };
};

/**
 * Normalize angle to the nearest standard engineering angle
 * Standard angles: 0°, 30°, 45°, 60°, 90°, 120°, 135°, 150°, 180°, etc.
 * @param {number} angle - Original angle in radians
 * @returns {number} Normalized angle in radians
 */
export const normalizeAngleToStandard = (angle) => {
  // Convert to degrees
  let degrees = (angle * 180 / Math.PI) % 360;
  if (degrees < 0) degrees += 360;
  
  // Define standard angles in degrees
  const standardAngles = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
  
  // Find closest standard angle
  let closestAngle = standardAngles[0];
  let minDiff = Math.abs(degrees - closestAngle);
  
  for (const stdAngle of standardAngles) {
    const diff = Math.min(
      Math.abs(degrees - stdAngle),
      Math.abs(degrees - stdAngle + 360),
      Math.abs(degrees - stdAngle - 360)
    );
    if (diff < minDiff) {
      minDiff = diff;
      closestAngle = stdAngle;
    }
  }
  
  // Convert back to radians
  return (closestAngle * Math.PI / 180);
};

/**
 * Check if two points are equal within tolerance
 * @param {Object} p1 - First point {x, y}
 * @param {Object} p2 - Second point {x, y}
 * @param {number} eps - Tolerance (default: 0.0001)
 * @returns {boolean} True if points are equal within tolerance
 */
export const pointsEqual = (p1, p2, eps = 0.0001) => {
  return Math.abs(p1.x - p2.x) < eps && Math.abs(p1.y - p2.y) < eps;
};

/**
 * Calculate the shortest distance from a point to a line segment
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {number} x1 - Segment start X
 * @param {number} y1 - Segment start Y
 * @param {number} x2 - Segment end X
 * @param {number} y2 - Segment end Y
 * @returns {number} Distance from point to segment
 */
export const pointDistanceToSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    const ddx = px - x1;
    const ddy = py - y1;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const tt = Math.max(0, Math.min(1, t));
  const cx = x1 + tt * dx;
  const cy = y1 + tt * dy;
  const ddx = px - cx;
  const ddy = py - cy;
  return Math.sqrt(ddx * ddx + ddy * ddy);
};

/**
 * Detect if a candidate segment significantly overlaps with existing segments
 * @param {Object} candidateSegment - Segment to check {startPoint, endPoint}
 * @param {Array} existingSegments - Array of existing segments
 * @returns {Object|null} Overlapping segment if found, null otherwise
 */
export const detectSignificantOverlap = (candidateSegment, existingSegments) => {
  if (!candidateSegment) return null;
  const { startPoint: cStart, endPoint: cEnd } = candidateSegment;
  if (!cStart || !cEnd) return null;
  
  const dx1 = cEnd.x - cStart.x;
  const dy1 = cEnd.y - cStart.y;
  const len1 = Math.hypot(dx1, dy1);
  if (len1 <= 1e-6) return null;
  
  const dirX = dx1 / len1;
  const dirY = dy1 / len1;

  for (const existing of existingSegments) {
    if (!existing || existing === candidateSegment) continue;
    const exStart = existing.startPoint;
    const exEnd = existing.endPoint;
    if (!exStart || !exEnd) continue;
    
    const dx2 = exEnd.x - exStart.x;
    const dy2 = exEnd.y - exStart.y;
    const len2 = Math.hypot(dx2, dy2);
    if (len2 <= 1e-6) continue;

    const denom = len1 * len2;
    if (denom <= 1e-12) continue;
    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) > 1e-6 * denom) continue;

    const dot = dx1 * dx2 + dy1 * dy2;
    const orientation = Math.abs(Math.abs(dot / denom) - 1);
    if (orientation > 1e-3) continue;

    const offsetStartX = exStart.x - cStart.x;
    const offsetStartY = exStart.y - cStart.y;
    const offsetEndX = exEnd.x - cStart.x;
    const offsetEndY = exEnd.y - cStart.y;
    const perpStart = Math.abs(offsetStartX * dirY - offsetStartY * dirX);
    const perpEnd = Math.abs(offsetEndX * dirY - offsetEndY * dirX);
    const tol = 1e-3 * Math.max(1, len1, len2);
    if (perpStart > tol || perpEnd > tol) continue;

    const projStart = offsetStartX * dirX + offsetStartY * dirY;
    const projEnd = offsetEndX * dirX + offsetEndY * dirY;
    const rangeStart = Math.min(projStart, projEnd);
    const rangeEnd = Math.max(projStart, projEnd);
    const overlapStart = Math.max(0, rangeStart);
    const overlapEnd = Math.min(len1, rangeEnd);
    const overlapLen = Math.max(0, overlapEnd - overlapStart);
    if (overlapLen <= 1e-6) continue;
    
    const overlapRatio = overlapLen / Math.min(len1, len2);
    if (overlapRatio >= 0.5) {
      return existing;
    }
  }

  return null;
};

/**
 * Detect if an endpoint lands on the middle of an existing segment
 * @param {Object} point - Point to check {x, y}
 * @param {Object} originPoint - Original point (to exclude from check) {x, y}
 * @param {Array} segments - Array of segments to check against
 * @param {number} tolerance - Distance tolerance (default: 3)
 * @returns {Object|null} Segment if endpoint lands on it, null otherwise
 */
export const detectEndpointLandingOnSegment = (point, originPoint, segments, tolerance = 3) => {
  if (!point) return null;
  
  for (const existing of segments) {
    if (!existing) continue;
    const start = existing.startPoint;
    const end = existing.endPoint;
    if (!start || !end) continue;
    
    if (originPoint && pointsEqual(point, originPoint, tolerance)) {
      continue;
    }
    
    const distStart = Math.hypot(point.x - start.x, point.y - start.y);
    if (distStart <= tolerance) {
      return existing;
    }
    const distEnd = Math.hypot(point.x - end.x, point.y - end.y);
    if (distEnd <= tolerance) {
      return existing;
    }
    
    const dist = pointDistanceToSegment(point.x, point.y, start.x, start.y, end.x, end.y);
    if (!Number.isFinite(dist) || dist > tolerance) continue;
    
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 1e-6) continue;
    
    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
    if (t > 0.01 && t < 0.99) {
      return existing;
    }
  }
  return null;
};

/**
 * Calculate angle difference (accounting for wraparound at 360°)
 * @param {number} a - First angle in degrees
 * @param {number} b - Second angle in degrees
 * @returns {number} Minimum angular difference
 */
export const degDiff = (a, b) => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};

/**
 * Convert radians to degrees
 * @param {number} rad - Angle in radians
 * @returns {number} Angle in degrees
 */
export const radToDeg = (rad) => {
  let d = rad * 180 / Math.PI;
  return d < 0 ? d + 360 : d;
};

/**
 * Convert degrees to radians
 * @param {number} deg - Angle in degrees
 * @returns {number} Angle in radians
 */
export const degToRad = (deg) => {
  return deg * Math.PI / 180;
};

/**
 * Calculate cyclic angle difference (shortest path)
 * @param {number} a - First angle in degrees
 * @param {number} b - Second angle in degrees
 * @returns {number} Shortest angular difference
 */
export const cyclicDiff = (a, b) => {
  let d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
};
