// Normalize imported/merged project data to avoid id collisions and
// ensure junctions/branch endpoints that lie on segment interiors are
// converted into explicit graph nodes by splitting host segments.

const round6 = (v) => Number(Number(v).toFixed(6));
const pointKey = (pt) => `${round6(pt?.x ?? 0).toFixed(6)}:${round6(pt?.y ?? 0).toFixed(6)}`;

const lerp = (a, b, t) => a + (b - a) * t;

const distancePointToSegment = (px, py, x1, y1, x2, y2) => {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const lenSq = C * C + D * D || 1;
  const dot = A * C + B * D;
  let t = dot / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const xx = x1 + t * C, yy = y1 + t * D;
  const dx = px - xx, dy = py - yy;
  return { d: Math.hypot(dx, dy), t };
};

const uniqueSortedTs = (arr, eps = 1e-9) => {
  const a = Array.from(new Set(arr.map((v) => {
    const r = Math.round(v / eps) * eps;
    return Number.isFinite(r) ? r : v;
  })) ).sort((p, q) => p - q);
  // ensure strict monotonic by collapsing too-close values
  const out = [];
  for (const v of a) {
    if (!out.length || Math.abs(v - out[out.length - 1]) > eps) out.push(v);
  }
  return out;
};

const genIdFactory = (prefix) => {
  let n = 0;
  const base = Date.now().toString(36);
  return () => `${prefix}_${base}_${(n++).toString(36)}`;
};

export function normalizeProjectData(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const JOIN_TOL = 1e-3; // world units
  const END_TOL = 1e-6;

  const nextSegId = genIdFactory('s');
  const nextCompId = genIdFactory('c');
  const nextFitId = genIdFactory('f');

  const segments = Array.isArray(raw.segments) ? raw.segments.filter(Boolean) : [];
  const components = Array.isArray(raw.components) ? raw.components.filter(Boolean) : [];
  const fittings = Array.isArray(raw.fittings) ? raw.fittings.filter(Boolean) : [];

  // Collect candidate split points: all segment endpoints + explicit junction components
  const candidatePoints = [];
  segments.forEach((s) => { if (s && s.startPoint) candidatePoints.push(s.startPoint); if (s && s.endPoint) candidatePoints.push(s.endPoint); });
  components.forEach((c) => { if (c && c.type === 'junction') candidatePoints.push({ x: c.x, y: c.y }); });

  // Split segments at interior candidate points
  const splitSegments = [];
  for (const s of segments) {
    if (!s || !s.startPoint || !s.endPoint) continue;
    // Record cut parameters with optional exact point to later snap endpoints
    const tWithPts = [{ t: 0, pt: { x: s.startPoint.x, y: s.startPoint.y } }, { t: 1, pt: { x: s.endPoint.x, y: s.endPoint.y } }];
    for (const p of candidatePoints) {
      const { d, t } = distancePointToSegment(p.x, p.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
      if (d <= JOIN_TOL && t > END_TOL && t < 1 - END_TOL) {
        tWithPts.push({ t, pt: { x: round6(p.x), y: round6(p.y) } });
      }
    }
    const cuts = uniqueSortedTs(tWithPts.map(e => e.t), 1e-9);
    // Helper to map t to a concrete point, snapping to candidate point when available
    const pointAt = (t) => {
      // find nearest recorded with same t within epsilon
      const EPS_T = 1e-6;
      let best = null; let bestDt = Infinity;
      for (const e of tWithPts) {
        const dt = Math.abs(e.t - t);
        if (dt <= EPS_T && dt < bestDt && e.pt) { best = e; bestDt = dt; }
      }
      if (best) return { x: round6(best.pt.x), y: round6(best.pt.y) };
      // fallback to interpolation
      return { x: round6(lerp(s.startPoint.x, s.endPoint.x, t)), y: round6(lerp(s.startPoint.y, s.endPoint.y, t)) };
    };
    if (cuts.length <= 2) {
      const geoLength = Math.hypot((s.endPoint.x ?? 0) - (s.startPoint.x ?? 0), (s.endPoint.y ?? 0) - (s.startPoint.y ?? 0));
      splitSegments.push({ ...s, id: s.id ?? nextSegId(), geoLength, startPoint: { x: round6(s.startPoint.x), y: round6(s.startPoint.y) }, endPoint: { x: round6(s.endPoint.x), y: round6(s.endPoint.y) } });
      continue;
    }
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1];
      const sp = pointAt(a);
      const ep = pointAt(b);
      const geoLength = Math.hypot((ep.x ?? 0) - (sp.x ?? 0), (ep.y ?? 0) - (sp.y ?? 0));
      splitSegments.push({ ...s, id: nextSegId(), startPoint: sp, endPoint: ep, geoLength });
    }
  }

  // Re-id components and fittings; optionally compute segmentId/fraction when they lie on a segment
  const reidComponents = components.map((c) => ({ ...c, id: c.id ?? nextCompId() }));
  const reidFittings = fittings.map((f) => ({ ...f, id: f.id ?? nextFitId() }));

  // Attach items to nearest segment when close enough; set segmentId + fraction
  const attachToSegment = (pt) => {
    let best = null;
    for (const s of splitSegments) {
      const { d, t } = distancePointToSegment(pt.x, pt.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
      if (d <= JOIN_TOL) {
        if (!best || d < best.d) best = { s, t, d };
      }
    }
    return best;
  };

  reidComponents.forEach((c) => {
    if (!c) return;
    const pt = { x: c.x ?? 0, y: c.y ?? 0 };
    const hit = attachToSegment(pt);
    if (hit) {
      c.segmentId = hit.s.id;
      c.fraction = Math.max(0, Math.min(1, hit.t));
    }
  });

  reidFittings.forEach((f) => {
    if (!f) return;
    const pt = { x: f.x ?? 0, y: f.y ?? 0 };
    const hit = attachToSegment(pt);
    if (hit) {
      f.segmentId = hit.s.id;
      f.fraction = Math.max(0, Math.min(1, hit.t));
    }
  });

  // Clear plan overrides to avoid stale coordinates from other projects
  const planComponentPositions = {};
  const planFittingPositions = {};

  return {
    ...raw,
    segments: splitSegments,
    components: reidComponents,
    fittings: reidFittings,
    planComponentPositions,
    planFittingPositions
  };
}
