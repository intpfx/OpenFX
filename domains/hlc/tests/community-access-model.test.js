import assert from "node:assert/strict";
import {
  ACTIONS,
  can,
  canTransitionContent,
  CONTENT_STATUSES,
  ROLES,
} from "../source/community-access-model.js";

Deno.test("the four-role model defaults to deny and exposes only public content to visitors", () => {
  assert.deepEqual(Object.values(ROLES), [
    "visitor",
    "resident",
    "worker",
    "admin",
  ]);

  assert.equal(can(ROLES.VISITOR, ACTIONS.READ_PUBLIC), true);
  assert.equal(can(ROLES.VISITOR, ACTIONS.SUBMIT_RESIDENT), false);
  assert.equal(can(ROLES.VISITOR, ACTIONS.EDIT_CONTENT), false);
  assert.equal(can("unknown", ACTIONS.READ_PUBLIC), false);
  assert.equal(can(ROLES.ADMIN, "unknown"), false);
});

Deno.test("residents submit and read only their own private records", () => {
  assert.equal(can(ROLES.RESIDENT, ACTIONS.SUBMIT_RESIDENT), true);
  assert.equal(
    can(ROLES.RESIDENT, ACTIONS.READ_PRIVATE, {
      actorId: "resident-a",
      ownerId: "resident-a",
    }),
    true,
  );
  assert.equal(
    can(ROLES.RESIDENT, ACTIONS.READ_PRIVATE, {
      actorId: "resident-a",
      ownerId: "resident-b",
    }),
    false,
  );
  assert.equal(can(ROLES.RESIDENT, ACTIONS.EDIT_CONTENT), false);
});

Deno.test("workers maintain content but only administrators publish and manage accounts", () => {
  assert.equal(can(ROLES.WORKER, ACTIONS.EDIT_CONTENT), true);
  assert.equal(can(ROLES.WORKER, ACTIONS.MANAGE_ASSETS), true);
  assert.equal(can(ROLES.WORKER, ACTIONS.MODERATE), true);
  assert.equal(can(ROLES.WORKER, ACTIONS.PUBLISH_CONTENT), false);
  assert.equal(can(ROLES.WORKER, ACTIONS.MANAGE_ACCOUNTS), false);

  assert.equal(can(ROLES.ADMIN, ACTIONS.PUBLISH_CONTENT), true);
  assert.equal(can(ROLES.ADMIN, ACTIONS.MANAGE_ACCOUNTS), true);
  assert.equal(can(ROLES.ADMIN, ACTIONS.MANAGE_CONFIG), true);
});

Deno.test("content follows draft, review, publish, and archive gates", () => {
  const own = { actorId: "worker-a", authorId: "worker-a" };
  const other = { actorId: "worker-b", authorId: "worker-a" };

  assert.equal(
    canTransitionContent(
      ROLES.WORKER,
      CONTENT_STATUSES.DRAFT,
      CONTENT_STATUSES.REVIEW,
      own,
    ),
    true,
  );
  assert.equal(
    canTransitionContent(
      ROLES.WORKER,
      CONTENT_STATUSES.DRAFT,
      CONTENT_STATUSES.REVIEW,
      other,
    ),
    false,
  );
  assert.equal(
    canTransitionContent(
      ROLES.WORKER,
      CONTENT_STATUSES.REVIEW,
      CONTENT_STATUSES.PUBLISHED,
      own,
    ),
    false,
  );
  assert.equal(
    canTransitionContent(
      ROLES.ADMIN,
      CONTENT_STATUSES.REVIEW,
      CONTENT_STATUSES.PUBLISHED,
    ),
    true,
  );
  assert.equal(
    canTransitionContent(
      ROLES.ADMIN,
      CONTENT_STATUSES.PUBLISHED,
      CONTENT_STATUSES.ARCHIVED,
    ),
    true,
  );
  assert.equal(
    canTransitionContent(
      ROLES.ADMIN,
      CONTENT_STATUSES.DRAFT,
      CONTENT_STATUSES.PUBLISHED,
    ),
    false,
  );
});
