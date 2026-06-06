const DEG_TOL = 5; // degrees
const EPS = 1e-6;

const toDegrees = (rad) => {
	let deg = (rad * 180) / Math.PI;
	if (deg < 0) deg += 360;
	if (deg >= 360) deg -= 360;
	return deg;
};

const closeAngle = (a, b, tol = DEG_TOL) => {
	const diff = Math.abs(a - b) % 360;
	return diff <= tol || 360 - diff <= tol;
};

const distance = (p1, p2) => Math.hypot((p2?.x ?? 0) - (p1?.x ?? 0), (p2?.y ?? 0) - (p1?.y ?? 0));

const pointKey = (pt) => `${Number(pt?.x ?? 0).toFixed(6)}:${Number(pt?.y ?? 0).toFixed(6)}`;

export const PLAN_AXIS = {
	EAST: 'east',
	WEST: 'west',
	NORTH: 'north',
	SOUTH: 'south',
	UP: 'up',
	DOWN: 'down'
};

export function categorizeSegmentDirection(segment) {
	if (!segment) return { axis: 'none', cardinal: null };
	const { startPoint, endPoint } = segment;
	if (!startPoint || !endPoint) return { axis: 'none', cardinal: null };
	const dx = (endPoint.x ?? 0) - (startPoint.x ?? 0);
	const dy = (endPoint.y ?? 0) - (startPoint.y ?? 0);
	const len = Math.hypot(dx, dy);
	if (len <= EPS) return { axis: 'none', cardinal: null };
	const angle = toDegrees(Math.atan2(dy, dx));
	if (closeAngle(angle, 0) || closeAngle(angle, 360)) {
		return { axis: 'x', cardinal: PLAN_AXIS.EAST, sign: 1 };
	}
	if (closeAngle(angle, 180)) {
		return { axis: 'x', cardinal: PLAN_AXIS.WEST, sign: -1 };
	}
	if (closeAngle(angle, 45)) {
		return { axis: 'y', cardinal: PLAN_AXIS.SOUTH, sign: 1 };
	}
	if (closeAngle(angle, 135)) {
		return { axis: 'y', cardinal: PLAN_AXIS.SOUTH, sign: 1 };
	}
	if (closeAngle(angle, 315)) {
		return { axis: 'y', cardinal: PLAN_AXIS.NORTH, sign: -1 };
	}
	if (closeAngle(angle, 225)) {
		return { axis: 'y', cardinal: PLAN_AXIS.NORTH, sign: -1 };
	}
	if (closeAngle(angle, 90)) {
		return { axis: 'z', cardinal: PLAN_AXIS.DOWN, sign: -1 };
	}
	if (closeAngle(angle, 270)) {
		return { axis: 'z', cardinal: PLAN_AXIS.UP, sign: 1 };
	}
	// fallback：根据 dx/dy 判断主轴
	if (Math.abs(dx) >= Math.abs(dy)) {
		return { axis: 'x', cardinal: dx >= 0 ? PLAN_AXIS.EAST : PLAN_AXIS.WEST, sign: dx >= 0 ? 1 : -1 };
	}
	if (Math.abs(dy) >= Math.abs(dx)) {
		if (dy >= 0) return { axis: 'y', cardinal: PLAN_AXIS.SOUTH, sign: 1 };
		return { axis: 'y', cardinal: PLAN_AXIS.NORTH, sign: -1 };
	}
	return { axis: 'none', cardinal: null };
}

export function buildNodeAdjacency(segments) {
	const adjacency = new Map();
	(segments || []).forEach((segment) => {
		const startKey = pointKey(segment.startPoint);
		const endKey = pointKey(segment.endPoint);
		if (!adjacency.has(startKey)) adjacency.set(startKey, []);
		if (!adjacency.has(endKey)) adjacency.set(endKey, []);
		adjacency.get(startKey).push({ segment, neighborKey: endKey, outgoing: true });
		adjacency.get(endKey).push({ segment, neighborKey: startKey, outgoing: false });
	});
	return adjacency;
}

export function computePlanPositions(segments) {
	const adjacency = buildNodeAdjacency(segments);
	const planPositions = new Map();
	const visited = new Set();

	const queue = [];
	const parseKeyToPoint = (key) => {
		if (!key || typeof key !== 'string') return { x: 0, y: 0 };
		const [sx, sy] = key.split(':');
		const px = Number(sx);
		const py = Number(sy);
		return {
			x: Number.isFinite(px) ? px : 0,
			y: Number.isFinite(py) ? py : 0
		};
	};
	const enqueueNode = (key, position) => {
		if (!planPositions.has(key)) {
			planPositions.set(key, position);
			queue.push(key);
		}
	};

	const keys = Array.from(adjacency.keys());
	if (keys.length === 0) return planPositions;

	keys.forEach((key) => {
		if (planPositions.has(key)) return;
		const fallback = parseKeyToPoint(key);
		enqueueNode(key, fallback);
		while (queue.length) {
			const currentKey = queue.shift();
			if (!currentKey) continue;
			if (visited.has(currentKey)) continue;
			visited.add(currentKey);
			const basePlan = planPositions.get(currentKey) || { x: 0, y: 0 };
			const neighbors = adjacency.get(currentKey) || [];
			neighbors.forEach(({ segment, neighborKey }) => {
				if (!segment) return;
				const direction = categorizeSegmentDirection(segment);
				const geoLen = Number.isFinite(segment.geoLength) ? segment.geoLength : distance(segment.startPoint, segment.endPoint);
				let delta = { x: 0, y: 0 };
				if (direction.axis === 'x') {
					// orientation relative to current node depends on whether we traverse start->end or end->start
					const fromStart = pointKey(segment.startPoint) === currentKey;
					const sign = fromStart ? direction.sign : -direction.sign;
					delta = { x: sign * geoLen, y: 0 };
				} else if (direction.axis === 'y') {
					const fromStart = pointKey(segment.startPoint) === currentKey;
					const sign = fromStart ? direction.sign : -direction.sign;
					delta = { x: 0, y: sign * geoLen };
				} else {
					delta = { x: 0, y: 0 };
				}
				const nextPlan = {
					x: basePlan.x + delta.x,
					y: basePlan.y + delta.y
				};
				if (!planPositions.has(neighborKey)) {
					enqueueNode(neighborKey, nextPlan);
				} else {
					const prev = planPositions.get(neighborKey);
					const diff = Math.hypot((prev.x ?? 0) - nextPlan.x, (prev.y ?? 0) - nextPlan.y);
					if (diff > 0.5) {
						// 若存在偏差，取平均以减少累计误差
						planPositions.set(neighborKey, {
							x: (prev.x + nextPlan.x) / 2,
							y: (prev.y + nextPlan.y) / 2
						});
					}
				}
			});
		}
	});

	return planPositions;
}

const ensureMapArray = (map, key) => {
	if (!map.has(key)) map.set(key, []);
	return map.get(key);
};

export function buildHorizontalAdjacency(segments) {
	const adjacency = new Map();
	(segments || []).forEach((segment) => {
		const direction = categorizeSegmentDirection(segment);
		if (direction.axis === 'z' || direction.axis === 'none') return;
		const startKey = pointKey(segment.startPoint);
		const endKey = pointKey(segment.endPoint);
		ensureMapArray(adjacency, startKey).push({ segment, neighborKey: endKey });
		ensureMapArray(adjacency, endKey).push({ segment, neighborKey: startKey });
	});
	return adjacency;
}

function orderChain(startKey, startNeighborSegment, horizontalAdjacency, planPositions) {
	const chain = [];
	// Track visited by object reference to avoid ID collisions across merged projects
	const visitedSegments = new Set();
	let currentKey = startKey;
	let prevKey = null;
	let currentSegment = startNeighborSegment;

	while (currentSegment) {
		const segRef = currentSegment.segment;
		if (segRef) {
			visitedSegments.add(segRef);
		}
		const nextKey = pointKey(currentSegment.segment.startPoint) === currentKey
			? pointKey(currentSegment.segment.endPoint)
			: pointKey(currentSegment.segment.startPoint);
		chain.push({
			currentNode: currentKey,
			nextNode: nextKey,
			segment: currentSegment.segment
		});
		prevKey = currentKey;
		currentKey = nextKey;

		const neighbors = (horizontalAdjacency.get(currentKey) || []).filter((edge) => edge.segment && edge.segment !== currentSegment.segment && !visitedSegments.has(edge.segment));
		if (neighbors.length !== 1) {
			// either dead-end or branch; stop chain here
			currentSegment = null;
		} else {
			currentSegment = neighbors[0];
		}
	}

	return { chain, endNodeKey: currentKey, visitedSegments };
}

function compressChainSegments(segmentsInChain, planPositions) {
	const compressed = [];
	let cursor = planPositions.get(segmentsInChain?.[0]?.currentNode) || { x: 0, y: 0 };
	let accumX = cursor.x;
	let accumY = cursor.y;

	segmentsInChain.forEach(({ currentNode, nextNode, segment }) => {
		if (!segment) return;
		const startPlan = planPositions.get(currentNode);
		const endPlan = planPositions.get(nextNode);
		if (!startPlan || !endPlan) return;
		const dx = endPlan.x - startPlan.x;
		const dy = endPlan.y - startPlan.y;
		const axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
		const length = axis === 'x' ? dx : dy;
		if (Math.abs(length) <= EPS) return; // ignore degenerate
		const material = segment.material;
		const diameter = segment.diameter;
		const last = compressed[compressed.length - 1];
		if (last && last.axis === axis && last.material === material && last.diameter === diameter) {
			last.length += length;
			last.sourceSegments.push(segment);
		} else {
			compressed.push({
				axis,
				length,
				material,
				diameter,
				sourceSegments: [segment]
			});
		}
	});

	const result = [];
	let current = { x: accumX, y: accumY };
	compressed.forEach((entry, index) => {
		if (!entry || Math.abs(entry.length) <= EPS) return;
		const startPoint = { ...current };
		const endPoint = entry.axis === 'x'
			? { x: current.x + entry.length, y: current.y }
			: { x: current.x, y: current.y + entry.length };
		const aggregateId = entry.sourceSegments.map((s) => s.id).join('+') || `plan-${index}-${Math.random().toString(36).slice(2, 8)}`;
		result.push({
			id: aggregateId,
			startPoint,
			endPoint,
			material: entry.material,
			diameter: entry.diameter,
			sourceSegments: entry.sourceSegments.map((s) => s.id),
			sourceRefs: entry.sourceSegments,
			originSegment: entry.sourceSegments[0] || null
		});
		current = endPoint;
	});

	return result;
}

export function buildPlanSegments(segments, planPositions) {
	const horizontalAdjacency = buildHorizontalAdjacency(segments);
	// Track visited by reference to avoid ID collisions
	const visitedSegmentRefs = new Set();
	const planSegments = [];

	const processFromNode = (nodeKey) => {
		const edges = horizontalAdjacency.get(nodeKey) || [];
		edges.forEach((edge) => {
			const segRef = edge.segment;
			if (!segRef || visitedSegmentRefs.has(segRef)) return;

			const { chain, endNodeKey, visitedSegments } = orderChain(nodeKey, edge, horizontalAdjacency, planPositions);
			chain.forEach(({ segment }) => {
				if (segment) visitedSegmentRefs.add(segment);
			});
			visitedSegments.forEach((seg) => visitedSegmentRefs.add(seg));

			if (chain.length === 0) return;
			const compressed = compressChainSegments(chain, planPositions);
			planSegments.push({
				chain,
				compressed,
				startNodeKey: nodeKey,
				endNodeKey
			});
		});
	};

	const nodeKeys = Array.from(horizontalAdjacency.keys());
	const degreeMap = new Map(nodeKeys.map((key) => [key, (horizontalAdjacency.get(key) || []).length]));

	nodeKeys.forEach((key) => {
		if ((degreeMap.get(key) || 0) !== 2) {
			processFromNode(key);
		}
	});

	nodeKeys.forEach((key) => {
		const edges = horizontalAdjacency.get(key) || [];
		edges.forEach((edge) => {
			const segRef = edge.segment;
			if (!segRef || visitedSegmentRefs.has(segRef)) return;
			processFromNode(key);
		});
	});

	// Flatten compressed segments into final list while preserving mapping
	const flatSegments = [];
	planSegments.forEach(({ compressed }) => {
		(compressed || []).forEach((entry) => {
			flatSegments.push(entry);
		});
	});

	return {
		segments: flatSegments,
		metadata: {
			planChains: planSegments
		}
	};
}

export function mapSegmentIdToPlan(planSegments) {
	const map = new Map();
	(planSegments || []).forEach((plan) => {
		(plan.sourceSegments || []).forEach((id) => {
			if (!map.has(id)) {
				map.set(id, []);
			}
			map.get(id).push(plan);
		});
	});
	return map;
}

export function locatePlanCoordinateOnSegment(segment, planPositions, fraction) {
	if (!segment) return null;
	const startKey = pointKey(segment.startPoint);
	const endKey = pointKey(segment.endPoint);
	const startPlan = planPositions.get(startKey);
	const endPlan = planPositions.get(endKey);
	if (!startPlan || !endPlan) return null;
	const t = typeof fraction === 'number' && Number.isFinite(fraction)
		? Math.max(0, Math.min(1, fraction))
		: 0.5;
	return {
		x: startPlan.x + (endPlan.x - startPlan.x) * t,
		y: startPlan.y + (endPlan.y - startPlan.y) * t
	};
}

function nearestHorizontalNeighbor(segment, planPositions, segmentsByNode) {
	if (!segment) return null;
	const startKey = pointKey(segment.startPoint);
	const endKey = pointKey(segment.endPoint);
	const candidates = [];
	[startKey, endKey].forEach((key) => {
		const list = segmentsByNode.get(key) || [];
		list.forEach((seg) => {
			const cat = categorizeSegmentDirection(seg);
			// Compare by reference to avoid excluding valid neighbors when IDs collide
			if (cat.axis !== 'z' && seg !== segment) {
				candidates.push({ segment: seg, nodeKey: key });
			}
		});
	});
	return candidates[0] || null;
}

export function buildComponentPlanPosition(component, segmentsMap, planPositions, planSegmentLookup, segmentsByNode) {
	if (!component) return null;
	const { segmentId } = component;
	if (!segmentId) {
		// 平面专属类型直接使用原位置
		return { x: component.x ?? 0, y: component.y ?? 0 };
	}
	const segment = segmentsMap.get(segmentId);
	if (!segment) return { x: component.x ?? 0, y: component.y ?? 0 };
	const cat = categorizeSegmentDirection(segment);
	if (cat.axis === 'z') {
		const neighbor = nearestHorizontalNeighbor(segment, planPositions, segmentsByNode);
		if (neighbor) {
			const nodePlan = planPositions.get(neighbor.nodeKey);
			if (nodePlan) {
				return { x: nodePlan.x, y: nodePlan.y, proxySegmentId: neighbor.segment.id };
			}
		}
		const nodeKey = pointKey(segment.startPoint);
		const fallbackPlan = planPositions.get(nodeKey) || { x: component.x ?? 0, y: component.y ?? 0 };
		return { x: fallbackPlan.x, y: fallbackPlan.y };
	}

	const fraction = typeof component.fraction === 'number' ? component.fraction : null;
	const coord = locatePlanCoordinateOnSegment(segment, planPositions, fraction);
	if (coord) return coord;

	const planSegs = planSegmentLookup.get(segmentId);
	if (planSegs && planSegs.length) {
		const planSeg = planSegs[0];
		const t = typeof fraction === 'number' ? fraction : 0.5;
		return {
			x: planSeg.startPoint.x + (planSeg.endPoint.x - planSeg.startPoint.x) * t,
			y: planSeg.startPoint.y + (planSeg.endPoint.y - planSeg.startPoint.y) * t
		};
	}

	return { x: component.x ?? 0, y: component.y ?? 0 };
}

export function buildPlanViewModel({
	segments = [],
	components = [],
	fittings = [],
	planComponentPositions = {},
	planFittingPositions = {},
	designStartPoint = null
}) {
	// 为平面转换构建“工作段集”：在内点（端点/接驳点落在他段内部）处临时切分，
	// 仅用于投影与邻接计算，不修改原始工程数据。
	const buildWorkingSegments = (srcSegments, srcComponents) => {
		const JOIN_TOL = 1e-3; const END_TOL = 1e-6;
		const round6 = (v) => Number(Number(v).toFixed(6));
		const lerp = (a, b, t) => a + (b - a) * t;
		const distancePointToSegment = (px, py, x1, y1, x2, y2) => {
			const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
			const lenSq = C * C + D * D || 1;
			const dot = A * C + B * D; let t = dot / lenSq;
			if (t < 0) t = 0; else if (t > 1) t = 1;
			const xx = x1 + t * C, yy = y1 + t * D; const dx = px - xx, dy = py - yy;
			return { d: Math.hypot(dx, dy), t };
		};
		const uniqueSortedTs = (arr, eps = 1e-9) => {
			const a = Array.from(new Set(arr.map((v) => {
				const r = Math.round(v / eps) * eps; return Number.isFinite(r) ? r : v;
			})) ).sort((p, q) => p - q);
			const out = []; for (const v of a) { if (!out.length || Math.abs(v - out[out.length - 1]) > eps) out.push(v); }
			return out;
		};
		const candidates = [];
		(srcSegments || []).forEach((s) => { if (s) { candidates.push(s.startPoint, s.endPoint); }});
		(srcComponents || []).forEach((c) => { if (c && c.type === 'junction') candidates.push({ x: c.x, y: c.y }); });
		const result = [];
		for (const s of (srcSegments || [])) {
			if (!s || !s.startPoint || !s.endPoint) continue;
			const tWithPts = [ { t: 0, pt: { x: s.startPoint.x, y: s.startPoint.y } }, { t: 1, pt: { x: s.endPoint.x, y: s.endPoint.y } } ];
			for (const p of candidates) {
				if (!p) continue;
				const { d, t } = distancePointToSegment(p.x, p.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
				if (d <= JOIN_TOL && t > END_TOL && t < 1 - END_TOL) {
					tWithPts.push({ t, pt: { x: round6(p.x), y: round6(p.y) } });
				}
			}
			const cuts = uniqueSortedTs(tWithPts.map(e => e.t), 1e-9);
			const pointAt = (t) => {
				const EPS_T = 1e-6; let best = null; let bestDt = Infinity;
				for (const e of tWithPts) { const dt = Math.abs(e.t - t); if (dt <= EPS_T && dt < bestDt && e.pt) { best = e; bestDt = dt; } }
				if (best) return { x: round6(best.pt.x), y: round6(best.pt.y) };
				return { x: round6(lerp(s.startPoint.x, s.endPoint.x, t)), y: round6(lerp(s.startPoint.y, s.endPoint.y, t)) };
			};
			if (cuts.length <= 2) {
				result.push({ ...s, startPoint: { x: round6(s.startPoint.x), y: round6(s.startPoint.y) }, endPoint: { x: round6(s.endPoint.x), y: round6(s.endPoint.y) } });
			} else {
				for (let i = 0; i < cuts.length - 1; i++) {
					const a = cuts[i], b = cuts[i + 1];
					const sp = pointAt(a); const ep = pointAt(b);
					result.push({ ...s, startPoint: sp, endPoint: ep });
				}
			}
		}
		return result;
	};

	const workingSegments = buildWorkingSegments(segments, components);

	const planPositionsRaw = computePlanPositions(workingSegments);

	// 补强：将“接驳点”等位于其它线段中点的节点，映射到该宿主线段的平面坐标上
	// 解决系统图中分支端点位于斜线中点时，平面图未随主线横向平移的问题
	(function augmentInteriorNodePlanPositions() {
		if (!Array.isArray(workingSegments) || !workingSegments.length) return;
		const JOIN_TOL = 1e-3; // 世界坐标连接容差
		const END_TOL = 1e-6;
		// 仅在场景中存在“接驳点”或存在端点落在其它线段内部时处理
		const junctionPoints = new Set(
			(components || [])
				.filter((c) => c && c.type === 'junction')
				.map((c) => pointKey({ x: c.x, y: c.y }))
		);

		const endpoints = [];
		(segments || []).forEach((s) => {
			if (!s) return;
			endpoints.push(s.startPoint, s.endPoint);
		});

		const distancePointToSegment = (px, py, x1, y1, x2, y2) => {
			const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
			const dot = A * C + B * D;
			const lenSq = C * C + D * D || 1;
			let t = dot / lenSq;
			if (t < 0) t = 0; else if (t > 1) t = 1;
			const xx = x1 + t * C, yy = y1 + t * D;
			return { d: Math.hypot(px - xx, py - yy), t };
		};

		const ensurePlanForPointOnSegment = (pt, seg) => {
			if (!pt || !seg) return;
			const { startPoint, endPoint } = seg;
			const kStart = pointKey(startPoint);
			const kEnd = pointKey(endPoint);
			const pStart = planPositionsRaw.get(kStart);
			const pEnd = planPositionsRaw.get(kEnd);
			if (!pStart || !pEnd) return;
			const { t } = distancePointToSegment(pt.x, pt.y, startPoint.x, startPoint.y, endPoint.x, endPoint.y);
			// 距离端点过近则无需插值（避免重复写入）
			if (t <= END_TOL || t >= 1 - END_TOL) return;
			const plan = { x: pStart.x + (pEnd.x - pStart.x) * t, y: pStart.y + (pEnd.y - pStart.y) * t };
			planPositionsRaw.set(pointKey(pt), plan);
		};

		// 方案 A：优先使用“接驳点”作为候选
		const candidatePoints = new Map(); // key -> {x,y}
		junctionPoints.forEach((k) => {
			const [sx, sy] = k.split(':');
			const x = Number(sx), y = Number(sy);
			if (Number.isFinite(x) && Number.isFinite(y)) candidatePoints.set(k, { x, y });
		});
		// 方案 B：若无接驳点，回退到所有端点（处理端点落在其它线段内部）
		if (candidatePoints.size === 0) {
			endpoints.forEach((p) => candidatePoints.set(pointKey(p), { x: p.x, y: p.y }));
		}

		candidatePoints.forEach((pt) => {
			// 寻找离该点最近且包含该点（中点内）的线段
			let host = null; let best = { d: Infinity, t: 0 };
			for (const s of workingSegments) {
				if (!s) continue;
				const { d, t } = distancePointToSegment(pt.x, pt.y, s.startPoint.x, s.startPoint.y, s.endPoint.x, s.endPoint.y);
				if (d <= JOIN_TOL && t > END_TOL && t < 1 - END_TOL) {
					if (d < best.d) { best = { d, t }; host = s; }
				}
			}
			if (host) {
				ensurePlanForPointOnSegment(pt, host);
			}
		});
	})();
		const { segments: planSegmentsRaw } = buildPlanSegments(workingSegments, planPositionsRaw);
	const planSegmentLookupRaw = mapSegmentIdToPlan(planSegmentsRaw);

	const segmentsMap = new Map((segments || []).map((s) => [s.id, s]));

	const segmentsByNode = new Map();
	(workingSegments || []).forEach((segment) => {
		const startKey = pointKey(segment.startPoint);
		const endKey = pointKey(segment.endPoint);
		ensureMapArray(segmentsByNode, startKey).push(segment);
		ensureMapArray(segmentsByNode, endKey).push(segment);
	});

	const computeTranslation = () => {
		if (!designStartPoint || planPositionsRaw.size === 0) return null;
		const startKey = pointKey(designStartPoint);
		if (planPositionsRaw.has(startKey)) {
			const plan = planPositionsRaw.get(startKey) || { x: 0, y: 0 };
			return {
				x: (designStartPoint.x ?? 0) - (plan.x ?? 0),
				y: (designStartPoint.y ?? 0) - (plan.y ?? 0)
			};
		}
		let bestPlan = null;
		let bestDist = Infinity;
		planPositionsRaw.forEach((planPos, nodeKey) => {
			const [sxStr, syStr] = nodeKey.split(':');
			const sx = Number(sxStr);
			const sy = Number(syStr);
			if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
			const d = Math.hypot((designStartPoint.x ?? 0) - sx, (designStartPoint.y ?? 0) - sy);
			if (d < bestDist) {
				bestDist = d;
				bestPlan = planPos;
			}
		});
		if (!bestPlan) return null;
		return {
			x: (designStartPoint.x ?? 0) - (bestPlan.x ?? 0),
			y: (designStartPoint.y ?? 0) - (bestPlan.y ?? 0)
		};
	};

	const originOffset = computeTranslation();
	const translatePoint = (point) => {
		const px = Number(point?.x ?? 0);
		const py = Number(point?.y ?? 0);
		if (!originOffset) return { x: px, y: py };
		return { x: px + originOffset.x, y: py + originOffset.y };
	};

	const planPositions = new Map();
	planPositionsRaw.forEach((pos, key) => {
		planPositions.set(key, translatePoint(pos));
	});

	const planSegments = (planSegmentsRaw || []).map((segment) => ({
		...segment,
		startPoint: translatePoint(segment.startPoint),
		endPoint: translatePoint(segment.endPoint)
	}));
	const planSegmentLookup = mapSegmentIdToPlan(planSegments);

	const pickOverride = (store, id) => {
		if (!store || typeof store !== 'object') return null;
		const candidate = store[id];
		if (!candidate) return null;
		const ox = Number(candidate.x);
		const oy = Number(candidate.y);
		if (!Number.isFinite(ox) || !Number.isFinite(oy)) return null;
		return { x: ox, y: oy };
	};

	const planComponents = (components || []).map((component) => {
		const planCoordRaw = buildComponentPlanPosition(component, segmentsMap, planPositionsRaw, planSegmentLookupRaw, segmentsByNode) || { x: component.x ?? 0, y: component.y ?? 0 };
		const proxySegmentId = planCoordRaw?.proxySegmentId || component.segmentId;
		const basePoint = translatePoint(planCoordRaw);
		const override = pickOverride(planComponentPositions, component.id);
		const renderPoint = override || basePoint;
		const planSegmentCandidates = planSegmentLookup.get(proxySegmentId) || [];
		const renderSeg = planSegmentCandidates[0];
		return {
			...component,
			planX: renderPoint.x,
			planY: renderPoint.y,
			planBaseX: basePoint.x,
			planBaseY: basePoint.y,
			systemX: component.x ?? 0,
			systemY: component.y ?? 0,
			x: renderPoint.x,
			y: renderPoint.y,
			renderX: renderPoint.x,
			renderY: renderPoint.y,
			proxySegmentId,
			renderSegmentId: renderSeg ? renderSeg.id : proxySegmentId,
			hasPlanOverride: !!override
		};
	});

	const planFittings = (fittings || []).map((fitting) => {
		if (!fitting) return fitting;
		const override = pickOverride(planFittingPositions, fitting.id);
		const segment = segmentsMap.get(fitting.segmentId);
		if (!segment) {
			const base = translatePoint({ x: fitting.x ?? 0, y: fitting.y ?? 0 });
			const renderPoint = override || base;
			return {
				...fitting,
				planX: renderPoint.x,
				planY: renderPoint.y,
				systemX: fitting.x ?? 0,
				systemY: fitting.y ?? 0,
				x: renderPoint.x,
				y: renderPoint.y,
				renderX: renderPoint.x,
				renderY: renderPoint.y,
				renderSegmentId: fitting.segmentId,
				hasPlanOverride: !!override
			};
		}
		const coord = locatePlanCoordinateOnSegment(segment, planPositionsRaw, fitting.fraction);
		const base = coord ? translatePoint(coord) : translatePoint({ x: fitting.x ?? 0, y: fitting.y ?? 0 });
		const renderPoint = override || base;
		const planSegmentCandidates = planSegmentLookup.get(segment.id) || [];
		const renderSeg = planSegmentCandidates[0];
		return {
			...fitting,
			planX: renderPoint.x,
			planY: renderPoint.y,
			systemX: fitting.x ?? 0,
			systemY: fitting.y ?? 0,
			x: renderPoint.x,
			y: renderPoint.y,
			renderX: renderPoint.x,
			renderY: renderPoint.y,
			renderSegmentId: renderSeg ? renderSeg.id : segment.id,
			hasPlanOverride: !!override
		};
	});

	return {
		planPositions,
		planSegments,
		planSegmentLookup,
		planComponents,
		planFittings,
		planOriginOffset: originOffset || { x: 0, y: 0 }
	};
}

export function translatePlanToCanvasCoords(point, scale = 1, offset = { x: 0, y: 0 }) {
	return {
		x: point.x * scale + offset.x,
		y: point.y * scale + offset.y
	};
}

export function formatPlanLegend(direction) {
	switch (direction) {
		case PLAN_AXIS.EAST:
			return '向东';
		case PLAN_AXIS.WEST:
			return '向西';
		case PLAN_AXIS.NORTH:
			return '向北';
		case PLAN_AXIS.SOUTH:
			return '向南';
		case PLAN_AXIS.UP:
			return '向上';
		case PLAN_AXIS.DOWN:
			return '向下';
		default:
			return '未知方向';
	}
}
