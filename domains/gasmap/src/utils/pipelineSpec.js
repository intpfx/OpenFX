export const normalizeMaterialGroup = (m) => {
  if (m === '镀锌钢管') return 'galvanized';
  if (m === '无缝钢管' || m === '直缝钢管') return 'steel';
  if (m === 'PE100 SDR11' || m === 'PE100 SDR17') return 'pe';
  return '';
};

export const parseDiameterNumeric = (d) => {
  if (typeof d !== 'string') return Number(d) || 0;
  if (d.startsWith('DN')) return Number(d.slice(2)) || 0;
  if (d.startsWith('dn')) return Number(d.slice(2)) || 0;
  if (d.startsWith('D')) return Number(d.slice(1)) || 0;
  const m = d.match(/[0-9.]+/);
  return m ? Number(m[0]) : 0;
};

export const isPEMaterial = (material) => (
  material === 'PE100 SDR11' || material === 'PE100 SDR17'
);

export const isSteelMaterial = (material) => (
  material === '镀锌钢管' || material === '无缝钢管' || material === '直缝钢管'
);

// Map common outside diameters (mm) to nominal DN values.
const OD_TO_DN_MAP = [
  { dn: 15, od: 21.3 },
  { dn: 20, od: 26.9 },
  { dn: 25, od: 33.7 },
  { dn: 32, od: 42.4 },
  { dn: 40, od: 48.3 },
  { dn: 50, od: 60.3 },
  { dn: 65, od: 76.1 },
  { dn: 80, od: 88.9 },
  { dn: 100, od: 114.3 },
  { dn: 125, od: 139.7 },
  { dn: 150, od: 168.3 },
  { dn: 200, od: 219.1 },
  { dn: 250, od: 273.0 },
  { dn: 300, od: 323.9 }
];

// Given a diameter string like 'D33.7', '33.7', or 'DN25', return a normalized
// DN string (e.g. 'DN25'). If unable to map, return the original input.
export const formatDiameterAsDN = (d) => {
  if (!d && d !== 0) return '';
  if (typeof d === 'number') {
    // assume numeric is OD in mm
    const od = Number(d) || 0;
    if (!od) return String(d);
    // find nearest mapping
    let best = null; let bestDiff = Infinity;
    for (const m of OD_TO_DN_MAP) {
      const diff = Math.abs(m.od - od);
      if (diff < bestDiff) { bestDiff = diff; best = m; }
    }
    return best ? `DN${best.dn}` : String(d);
  }
  const s = String(d).trim();
  if (!s) return '';
  // already DN
  const dnMatch = s.match(/^DN\s*(\d+)$/i);
  if (dnMatch) return `DN${dnMatch[1]}`;
  // starts with D (OD) like D33.7
  const dMatch = s.match(/^D\s*([0-9.]+)/i);
  if (dMatch) {
    const od = Number(dMatch[1]);
    if (od) {
      let best = null; let bestDiff = Infinity;
      for (const m of OD_TO_DN_MAP) {
        const diff = Math.abs(m.od - od);
        if (diff < bestDiff) { bestDiff = diff; best = m; }
      }
      return best ? `DN${best.dn}` : s;
    }
  }
  // if it's a plain number string, treat as OD
  const numMatch = s.match(/^([0-9.]+)$/);
  if (numMatch) {
    const od = Number(numMatch[1]);
    if (od) {
      let best = null; let bestDiff = Infinity;
      for (const m of OD_TO_DN_MAP) {
        const diff = Math.abs(m.od - od);
        if (diff < bestDiff) { bestDiff = diff; best = m; }
      }
      return best ? `DN${best.dn}` : s;
    }
  }
  return s;
};

// Format as 'D{od}' (outside diameter). If input is 'DNxx' or numeric, map to OD using the table.
export const formatDiameterAsD = (d) => {
  if (!d && d !== 0) return '';
  if (typeof d === 'number') {
    return `D${Number(d)}`;
  }
  const s = String(d).trim();
  if (!s) return '';
  // already D... keep as-is (normalize spacing)
  const dMatch = s.match(/^D\s*([0-9.]+)$/i);
  if (dMatch) return `D${dMatch[1]}`;
  // DNxx -> lookup OD
  const dnMatch = s.match(/^DN\s*(\d+)$/i);
  if (dnMatch) {
    const dn = Number(dnMatch[1]);
    const found = OD_TO_DN_MAP.find(m => m.dn === dn);
    if (found) return `D${found.od}`;
    return s;
  }
  // plain number as OD
  const numMatch = s.match(/^([0-9.]+)$/);
  if (numMatch) return `D${numMatch[1]}`;
  return s;
};

// Decide whether to format as DN or D based on context rules.
// context may include: material (e.g. '镀锌钢管'), componentType (e.g. 'copperValve'), or group ('galvanized'|'steel')
export const formatDiameterForDisplay = (d, context = {}) => {
  const { material, componentType, group } = context || {};
  // material-based rules
  if (material) {
    if (material === '镀锌钢管') return formatDiameterAsDN(d);
    if (material === '无缝钢管' || material === '直缝钢管') return formatDiameterAsD(d);
  }
  // component-type rules
  if (componentType) {
    if (componentType === 'copperValve' || componentType === 'explosionProofValve') return formatDiameterAsDN(d);
    if (componentType === 'flangeValve' || componentType === 'heatShrinkSleeve') return formatDiameterAsD(d);
  }
  // group rules (used in connection fitting labeling where group is 'galvanized' or 'steel')
  if (group) {
    if (group === 'galvanized') return formatDiameterAsDN(d);
    if (group === 'steel') return formatDiameterAsD(d);
  }
  // fallback: prefer DN for backward compatibility
  return formatDiameterAsDN(d);
};

// 统一比例策略默认值：用于把现实长度映射到像素，并限制像素范围
// 说明：
// - pxPerMeterBase: 在视图 scale=1 下每米对应的像素数（不依赖 CanvasView 的 BASE_VISUAL_SCALE）
// - minSegmentPx/maxSegmentPx: 管段在屏幕上的最小/最大像素长度，避免过短难以操作或过长影响版式
// - allowAutoSplit: 过长时是否允许自动建议分段
import scaleSettings from '../config/scaleSettings.json';

// Build defaultScalePolicy from external JSON config so it's easy to tweak
export const defaultScalePolicy = {
  unit: 'm',
  pxPerMeterBase: Number(scaleSettings?.pxPerMeterBase) || 48,
  minSegmentPx: Number(scaleSettings?.minSegmentPx) || 24,
  maxSegmentPx: Number(scaleSettings?.maxSegmentPx) || 480,
  allowAutoSplit: true,
};