import { define } from "@/utils.ts";
import { getUnlockRule, isAdminUnlockKey } from "@/utils/unlocks.ts";

export const handlers = define.handlers({
  async POST(ctx) {
    let body: unknown;

    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const key = typeof (body as Record<string, unknown>)?.key === "string"
      ? (body as Record<string, string>).key.trim().toLowerCase()
      : "";

    if (!key) {
      return Response.json({ ok: false, error: "missing_key" }, { status: 400 });
    }

    if (isAdminUnlockKey(key)) {
      return Response.json({ ok: true, mode: "admin", redirect: "/admin" });
    }

    const rule = await getUnlockRule(key);
    if (!rule) {
      return Response.json({ ok: false, error: "invalid_key" }, { status: 404 });
    }

    return Response.json({
      ok: true,
      mode: "projects",
      projectIds: rule.projectIds,
      hint: rule.hint ?? "Unlocked hidden projects",
    });
  },
});
