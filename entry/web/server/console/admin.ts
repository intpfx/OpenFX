import { type ConsoleControlPlane, getConsoleControlPlane } from "./control-plane.ts";

export const requireAdminSession = async (
  req: Request,
  plane: ConsoleControlPlane = getConsoleControlPlane(),
): Promise<Response | null> => {
  const session = await plane.adminSession.get(req);
  return session.ok ? null : session;
};
