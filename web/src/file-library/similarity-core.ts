const HEX_BYTE = /^[0-9a-f]{2}$/i;
const HEX_HASH = /^[0-9a-f]{64}$/i;

export const FILE_FINGERPRINT_VERSION = 1 as const;

export type FileFingerprint = {
  version: typeof FILE_FINGERPRINT_VERSION;
  status: "pending" | "running" | "completed" | "unsupported" | "failed";
  exact?: {
    algorithm?: "sha-256";
    source: string;
    motion?: string;
  };
  still?: {
    algorithm?: "pdq-256";
    hash: string;
  };
  video?: {
    algorithm?: "pdq-256-sequence";
    durationSec: number;
    timestampsSec: number[];
    hashes: string[];
  };
  updatedAt?: string;
  error?: string;
};

export type SimilarityCandidate = {
  id: string;
  kind: string;
  fingerprint?: FileFingerprint;
};

export type SimilarityGroup = {
  id: string;
  type: "exact" | "similar";
  itemIds: string[];
  similarity: number;
};

export type SimilarityGridEntry<T extends SimilarityCandidate> =
  | {
    id: string;
    kind: "item";
    items: [T];
  }
  | {
    id: string;
    kind: "group";
    group: SimilarityGroup;
    items: T[];
  };

export const PDQ_DUPLICATE_DISTANCE = 31;
export const VIDEO_DUPLICATE_FRAME_RATIO = 0.6;

export function createPendingFileFingerprint(): FileFingerprint {
  return { version: FILE_FINGERPRINT_VERSION, status: "pending" };
}

export function normalizeFileFingerprint(value: unknown): FileFingerprint | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FileFingerprint>;
  const statuses = new Set<FileFingerprint["status"]>([
    "pending",
    "running",
    "completed",
    "unsupported",
    "failed",
  ]);
  if (
    candidate.version !== FILE_FINGERPRINT_VERSION ||
    !candidate.status || !statuses.has(candidate.status)
  ) {
    return null;
  }
  const exact = candidate.exact && typeof candidate.exact.source === "string" &&
      (!candidate.exact.motion || typeof candidate.exact.motion === "string")
    ? candidate.exact
    : undefined;
  const still = candidate.still && HEX_HASH.test(candidate.still.hash)
    ? candidate.still
    : undefined;
  const video = candidate.video && Number.isFinite(candidate.video.durationSec) &&
      Array.isArray(candidate.video.timestampsSec) &&
      Array.isArray(candidate.video.hashes) && candidate.video.hashes.length > 0 &&
      candidate.video.hashes.length === candidate.video.timestampsSec.length &&
      candidate.video.hashes.every((hash) => HEX_HASH.test(hash))
    ? candidate.video
    : undefined;
  if (candidate.status === "completed" && !exact) return null;
  return {
    version: FILE_FINGERPRINT_VERSION,
    status: candidate.status === "running" ? "pending" : candidate.status,
    exact,
    still,
    video,
    updatedAt: typeof candidate.updatedAt === "string"
      ? candidate.updatedAt
      : undefined,
    error: typeof candidate.error === "string" ? candidate.error : undefined,
  };
}

function countBits(value: number): number {
  let bits = value;
  let count = 0;
  while (bits !== 0) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

export function hammingDistanceHex(left: string, right: string): number {
  if (left.length !== 64 || right.length !== 64) {
    throw new Error("PDQ 哈希必须是 64 位十六进制字符串");
  }
  let distance = 0;
  for (let offset = 0; offset < left.length; offset += 2) {
    const leftByte = left.slice(offset, offset + 2);
    const rightByte = right.slice(offset, offset + 2);
    if (!HEX_BYTE.test(leftByte) || !HEX_BYTE.test(rightByte)) {
      throw new Error("PDQ 哈希包含非法字符");
    }
    distance += countBits(
      Number.parseInt(leftByte, 16) ^ Number.parseInt(rightByte, 16),
    );
  }
  return distance;
}

function exactFingerprintKey(fingerprint: FileFingerprint): string | null {
  if (fingerprint.status !== "completed" || !fingerprint.exact?.source) return null;
  return fingerprint.exact.motion
    ? `${fingerprint.exact.source}:${fingerprint.exact.motion}`
    : fingerprint.exact.source;
}

function imageSimilarity(
  left: FileFingerprint,
  right: FileFingerprint,
): number | null {
  if (!left.still?.hash || !right.still?.hash) return null;
  const distance = hammingDistanceHex(left.still.hash, right.still.hash);
  return distance <= PDQ_DUPLICATE_DISTANCE ? 1 - distance / 256 : null;
}

function videoSimilarity(
  left: FileFingerprint,
  right: FileFingerprint,
): number | null {
  const leftVideo = left.video;
  const rightVideo = right.video;
  if (!leftVideo?.hashes.length || !rightVideo?.hashes.length) return null;
  const durationDifference = Math.abs(leftVideo.durationSec - rightVideo.durationSec);
  const durationTolerance = Math.max(
    3,
    Math.max(leftVideo.durationSec, rightVideo.durationSec) * 0.1,
  );
  if (durationDifference > durationTolerance) return null;

  const sampleCount = Math.max(leftVideo.hashes.length, rightVideo.hashes.length);
  let matchCount = 0;
  let totalDistance = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const position = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const leftIndex = Math.round(position * (leftVideo.hashes.length - 1));
    const rightIndex = Math.round(position * (rightVideo.hashes.length - 1));
    const distance = hammingDistanceHex(
      leftVideo.hashes[leftIndex],
      rightVideo.hashes[rightIndex],
    );
    if (distance <= PDQ_DUPLICATE_DISTANCE) matchCount += 1;
    totalDistance += distance;
  }
  if (matchCount / sampleCount < VIDEO_DUPLICATE_FRAME_RATIO) return null;
  return 1 - totalDistance / (sampleCount * 256);
}

function candidateSimilarity(
  left: SimilarityCandidate,
  right: SimilarityCandidate,
): number | null {
  if (
    left.kind !== right.kind || left.fingerprint?.status !== "completed" ||
    right.fingerprint?.status !== "completed"
  ) {
    return null;
  }
  if (left.kind === "image") {
    return imageSimilarity(left.fingerprint, right.fingerprint);
  }
  if (left.kind === "video") {
    return videoSimilarity(left.fingerprint, right.fingerprint);
  }
  if (left.kind === "live-photo") {
    const stillScore = imageSimilarity(left.fingerprint, right.fingerprint);
    const videoScore = videoSimilarity(left.fingerprint, right.fingerprint);
    return stillScore === null || videoScore === null
      ? null
      : Math.min(stillScore, videoScore);
  }
  return null;
}

export function findSimilarityGroups(
  candidates: readonly SimilarityCandidate[],
): SimilarityGroup[] {
  const parent = new Map(candidates.map((candidate) => [candidate.id, candidate.id]));
  const edges: Array<{ left: string; right: string; similarity: number }> = [];

  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const unite = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  const exactBuckets = new Map<string, string[]>();
  for (const candidate of candidates) {
    const key = candidate.fingerprint
      ? exactFingerprintKey(candidate.fingerprint)
      : null;
    if (!key) continue;
    exactBuckets.set(key, [...(exactBuckets.get(key) ?? []), candidate.id]);
  }
  for (const itemIds of exactBuckets.values()) {
    const [first, ...rest] = itemIds;
    for (const itemId of rest) unite(first, itemId);
  }

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidates.length;
      rightIndex += 1
    ) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const similarity = candidateSimilarity(left, right);
      if (similarity === null) continue;
      edges.push({ left: left.id, right: right.id, similarity });
      unite(left.id, right.id);
    }
  }

  const members = new Map<string, string[]>();
  for (const candidate of candidates) {
    const root = find(candidate.id);
    const rootMembers = members.get(root);
    if (rootMembers) rootMembers.push(candidate.id);
    else members.set(root, [candidate.id]);
  }

  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const groups: SimilarityGroup[] = [];
  for (const itemIds of members.values()) {
    if (itemIds.length < 2) continue;
    const sortedIds = [...itemIds].sort();
    const idSet = new Set(sortedIds);
    const exactKeys = new Set<string | null>();
    for (const itemId of sortedIds) {
      const fingerprint = candidateById.get(itemId)?.fingerprint;
      exactKeys.add(fingerprint ? exactFingerprintKey(fingerprint) : null);
    }
    const exactKey = exactKeys.size === 1 ? [...exactKeys][0] : null;
    let weakestVisualSimilarity = 1;
    for (const edge of edges) {
      if (idSet.has(edge.left) && idSet.has(edge.right)) {
        weakestVisualSimilarity = Math.min(
          weakestVisualSimilarity,
          edge.similarity,
        );
      }
    }
    groups.push({
      id: exactKey ? `exact:${exactKey}` : `similar:${sortedIds.join(":")}`,
      type: exactKey ? "exact" : "similar",
      itemIds: sortedIds,
      similarity: exactKey ? 1 : weakestVisualSimilarity,
    });
  }
  return groups.sort((
    left,
    right,
  ) => left.id.localeCompare(right.id));
}

export function buildSimilarityGridEntries<T extends SimilarityCandidate>(
  candidates: readonly T[],
): SimilarityGridEntry<T>[] {
  const groups = findSimilarityGroups(candidates);
  const groupByItemId = new Map<string, SimilarityGroup>();
  for (const group of groups) {
    for (const itemId of group.itemIds) groupByItemId.set(itemId, group);
  }

  const emittedGroups = new Set<string>();
  return candidates.flatMap((candidate): SimilarityGridEntry<T>[] => {
    const group = groupByItemId.get(candidate.id);
    if (!group) {
      return [{
        id: `item:${candidate.id}`,
        kind: "item",
        items: [candidate],
      }];
    }
    if (emittedGroups.has(group.id)) return [];
    emittedGroups.add(group.id);
    const groupIds = new Set(group.itemIds);
    return [{
      id: `group:${group.id}`,
      kind: "group",
      group,
      items: candidates.filter((item) => groupIds.has(item.id)),
    }];
  });
}
