export const ROLES = Object.freeze({
  VISITOR: "visitor",
  RESIDENT: "resident",
  WORKER: "worker",
  ADMIN: "admin",
});

export const ACTIONS = Object.freeze({
  READ_PUBLIC: "read:public",
  READ_PRIVATE: "read:private",
  SUBMIT_RESIDENT: "submit:resident",
  EDIT_CONTENT: "edit:content",
  SUBMIT_REVIEW: "submit:review",
  PUBLISH_CONTENT: "publish:content",
  MANAGE_ASSETS: "manage:assets",
  MODERATE: "moderate",
  MANAGE_ACCOUNTS: "manage:accounts",
  MANAGE_CONFIG: "manage:config",
});

export const CONTENT_STATUSES = Object.freeze({
  DRAFT: "draft",
  REVIEW: "review",
  PUBLISHED: "published",
  ARCHIVED: "archived",
});

const KNOWN_ROLES = new Set(Object.values(ROLES));
const OWN_PRIVATE_RECORD = ({ actorId, ownerId } = {}) =>
  Boolean(actorId && ownerId && actorId === ownerId);

const PERMISSIONS = Object.freeze({
  [ACTIONS.READ_PUBLIC]: () => true,
  [ACTIONS.READ_PRIVATE]: (role, context) =>
    role === ROLES.ADMIN || role === ROLES.WORKER ||
    (role === ROLES.RESIDENT && OWN_PRIVATE_RECORD(context)),
  [ACTIONS.SUBMIT_RESIDENT]: (role) =>
    role === ROLES.RESIDENT || role === ROLES.WORKER || role === ROLES.ADMIN,
  [ACTIONS.EDIT_CONTENT]: (role) =>
    role === ROLES.WORKER || role === ROLES.ADMIN,
  [ACTIONS.SUBMIT_REVIEW]: (role) =>
    role === ROLES.WORKER || role === ROLES.ADMIN,
  [ACTIONS.PUBLISH_CONTENT]: (role) => role === ROLES.ADMIN,
  [ACTIONS.MANAGE_ASSETS]: (role) =>
    role === ROLES.WORKER || role === ROLES.ADMIN,
  [ACTIONS.MODERATE]: (role) => role === ROLES.WORKER || role === ROLES.ADMIN,
  [ACTIONS.MANAGE_ACCOUNTS]: (role) => role === ROLES.ADMIN,
  [ACTIONS.MANAGE_CONFIG]: (role) => role === ROLES.ADMIN,
});

export function can(role, action, context = {}) {
  if (!KNOWN_ROLES.has(role)) return false;
  const permission = PERMISSIONS[action];
  return permission ? permission(role, context) : false;
}

export function canTransitionContent(role, from, to, context = {}) {
  if (!KNOWN_ROLES.has(role) || from === to) return false;

  if (role === ROLES.WORKER) {
    const ownsDraft = context.actorId && context.authorId &&
      context.actorId === context.authorId;
    return Boolean(
      ownsDraft &&
        ((from === CONTENT_STATUSES.DRAFT &&
          to === CONTENT_STATUSES.REVIEW) ||
          (from === CONTENT_STATUSES.REVIEW &&
            to === CONTENT_STATUSES.DRAFT)),
    );
  }

  if (role !== ROLES.ADMIN) return false;

  return (
    (from === CONTENT_STATUSES.DRAFT && to === CONTENT_STATUSES.REVIEW) ||
    (from === CONTENT_STATUSES.REVIEW &&
      (to === CONTENT_STATUSES.DRAFT ||
        to === CONTENT_STATUSES.PUBLISHED)) ||
    (from === CONTENT_STATUSES.PUBLISHED &&
      to === CONTENT_STATUSES.ARCHIVED) ||
    (from === CONTENT_STATUSES.ARCHIVED && to === CONTENT_STATUSES.DRAFT)
  );
}
