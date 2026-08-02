import {
  canTransitionContent,
  CONTENT_STATUSES,
} from "./community-access-model.js";

const SPECIAL_CONTENT_NAMES = new Set([
  "intro",
  "example",
  "study",
  "participation",
  "support",
]);

function copy(value) {
  return structuredClone(value);
}

export function getContentStorageKey(data, id) {
  if (SPECIAL_CONTENT_NAMES.has(data?.name)) return [data.name];
  return ["news", data.createTime, id];
}

export function createDraftRecord({ data, actor, existing = null, now, id }) {
  if (!actor?.id || !actor?.role) throw new TypeError("缺少内容维护者身份");
  const savedAt = Number(now) || Date.now();
  const contentData = copy(data ?? {});
  const contentId = existing?.id ?? id ??
    (SPECIAL_CONTENT_NAMES.has(contentData.name)
      ? `special:${contentData.name}`
      : crypto.randomUUID());
  if (!contentData.name) {
    contentData.id = contentId;
    contentData.createTime = contentData.createTime ||
      existing?.data?.createTime ||
      savedAt;
  }

  return Object.freeze({
    id: contentId,
    status: CONTENT_STATUSES.DRAFT,
    revision: (existing?.revision ?? 0) + 1,
    authorId: existing?.authorId ?? actor.id,
    updatedBy: actor.id,
    createdAt: existing?.createdAt ?? savedAt,
    updatedAt: savedAt,
    submittedAt: null,
    publishedAt: existing?.publishedAt ?? null,
    archivedAt: existing?.archivedAt ?? null,
    data: contentData,
  });
}

export function transitionContentRecord({ record, actor, to, now }) {
  if (!record || !actor?.id || !actor?.role) {
    throw new TypeError("缺少内容状态或操作者身份");
  }
  if (
    !canTransitionContent(actor.role, record.status, to, {
      actorId: actor.id,
      authorId: record.authorId,
    })
  ) {
    throw new TypeError(`不允许从 ${record.status} 转为 ${to}`);
  }

  const changedAt = Number(now) || Date.now();
  return Object.freeze({
    ...copy(record),
    status: to,
    updatedBy: actor.id,
    updatedAt: changedAt,
    submittedAt: to === CONTENT_STATUSES.REVIEW
      ? changedAt
      : record.submittedAt,
    publishedAt: to === CONTENT_STATUSES.PUBLISHED
      ? changedAt
      : record.publishedAt,
    archivedAt: to === CONTENT_STATUSES.ARCHIVED
      ? changedAt
      : record.archivedAt,
  });
}

export function createAuditEntry(
  { actor, action, targetId, now, detail = {} },
) {
  if (!actor?.id || !actor?.role || !action || !targetId) {
    throw new TypeError("审计记录缺少必要字段");
  }
  return Object.freeze({
    id: crypto.randomUUID(),
    time: Number(now) || Date.now(),
    actorId: actor.id,
    actorRole: actor.role,
    action,
    targetId,
    detail: copy(detail),
  });
}
