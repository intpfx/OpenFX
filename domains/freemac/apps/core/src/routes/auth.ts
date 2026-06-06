import { Elysia, t } from "elysia";
import {
  createSession,
  destroySession,
  hasSession,
  verifyPassword,
} from "../services/auth.service";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .get("/status", ({ headers }) => ({
    ok: true,
    authenticated: hasSession(headers["x-session-id"]),
  }))
  .post(
    "/login",
    async ({ body }) => {
      if (!(await verifyPassword(body.password))) {
        return { ok: false, message: "Invalid password" };
      }

      const sessionId = createSession();
      return { ok: true, sessionId };
    },
    {
      body: t.Object({
        password: t.String({ minLength: 8 }),
      }),
    },
  )
  .post("/logout", ({ headers }) => {
    destroySession(headers["x-session-id"]);
    return { ok: true };
  });
