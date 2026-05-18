import { define } from "@/utils.ts";
import {
  deleteUnlockRule,
  getAdminUnlockKey,
  listUnlockRules,
  saveUnlockRule,
  validateUnlockRule,
  type UnlockRule,
} from "@/utils/unlocks.ts";

const isAuthorized = (req: Request): boolean => {
  const configured = getAdminUnlockKey();
  const provided = (req.headers.get("x-openfx-admin-key") ?? "").trim();
  return !!configured && provided === configured;
};

export const handlers = define.handlers({
  async GET(ctx) {
    if (!isAuthorized(ctx.req)) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    return Response.json({ ok: true, rules: await listUnlockRules() });
  },

  async POST(ctx) {
    if (!isAuthorized(ctx.req)) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const rule = body as UnlockRule;
    const normalized: UnlockRule = {
      key: String(rule.key ?? "").trim().toLowerCase(),
      label: String(rule.label ?? "").trim(),
      projectIds: Array.isArray(rule.projectIds)
        ? rule.projectIds.map((value) => String(value))
        : [],
      hint: String(rule.hint ?? "").trim() || undefined,
    };

    const error = validateUnlockRule(normalized);
    if (error) {
      return Response.json({ ok: false, error }, { status: 400 });
    }

    await saveUnlockRule(normalized);
    return Response.json({ ok: true, rule: normalized });
  },

  async DELETE(ctx) {
    if (!isAuthorized(ctx.req)) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(ctx.req.url);
    const key = url.searchParams.get("key")?.trim().toLowerCase() ?? "";
    if (!key) {
      return Response.json({ ok: false, error: "missing_key" }, { status: 400 });
    }

    await deleteUnlockRule(key);
    return Response.json({ ok: true, deleted: key });
  },
});
