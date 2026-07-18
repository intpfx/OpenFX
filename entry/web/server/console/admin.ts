import { getConsoleControlPlane } from "./control-plane.ts";

export const requireAdminSession = async (req: Request): Promise<Response | null> =>
  await getConsoleControlPlane().authorize(req)
    ? null
    : Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
