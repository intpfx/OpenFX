import assert from "node:assert/strict";
import {
  createAuditEntry,
  createDraftRecord,
  getContentStorageKey,
  transitionContentRecord,
} from "../source/community-content-workflow.js";
import { CONTENT_STATUSES, ROLES } from "../source/community-access-model.js";

const worker = Object.freeze({ id: "worker-a", role: ROLES.WORKER });
const admin = Object.freeze({ id: "admin-a", role: ROLES.ADMIN });

Deno.test("saving content creates a revisioned draft without mutating public data", () => {
  const record = createDraftRecord({
    data: { title: "社区动态", blocks: [] },
    actor: worker,
    now: 100,
    id: "article-a",
  });

  assert.equal(record.id, "article-a");
  assert.equal(record.status, CONTENT_STATUSES.DRAFT);
  assert.equal(record.revision, 1);
  assert.equal(record.authorId, worker.id);
  assert.equal(record.data.title, "社区动态");
  assert.deepEqual(getContentStorageKey(record.data, record.id), [
    "news",
    record.data.createTime,
    record.id,
  ]);
});

Deno.test("workers submit their own drafts and admins publish reviewed content", () => {
  const draft = createDraftRecord({
    data: { name: "intro", title: "圣灯社区简介", blocks: [] },
    actor: worker,
    now: 100,
  });
  const review = transitionContentRecord({
    record: draft,
    actor: worker,
    to: CONTENT_STATUSES.REVIEW,
    now: 200,
  });
  const published = transitionContentRecord({
    record: review,
    actor: admin,
    to: CONTENT_STATUSES.PUBLISHED,
    now: 300,
  });

  assert.equal(review.status, CONTENT_STATUSES.REVIEW);
  assert.equal(published.status, CONTENT_STATUSES.PUBLISHED);
  assert.equal(published.publishedAt, 300);
  assert.deepEqual(getContentStorageKey(published.data, published.id), [
    "intro",
  ]);
});

Deno.test("invalid content transitions are rejected and audit entries identify the actor", () => {
  const draft = createDraftRecord({
    data: { title: "待审核", blocks: [] },
    actor: worker,
    now: 100,
    id: "article-b",
  });
  assert.throws(
    () =>
      transitionContentRecord({
        record: draft,
        actor: admin,
        to: CONTENT_STATUSES.PUBLISHED,
        now: 200,
      }),
    /不允许/,
  );

  const audit = createAuditEntry({
    actor: admin,
    action: "content.publish",
    targetId: draft.id,
    now: 300,
  });
  assert.equal(audit.actorId, admin.id);
  assert.equal(audit.actorRole, ROLES.ADMIN);
  assert.equal(audit.action, "content.publish");
});
