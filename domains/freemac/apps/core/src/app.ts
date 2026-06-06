import { existsSync } from "node:fs";
import { join } from "node:path";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { config } from "./config";
import { authRoutes } from "./routes/auth";
import { systemRoutes } from "./routes/system";
import { agentRoutes } from "./routes/agent";
import { eventsRoutes } from "./routes/events";
import { setupRoutes } from "./routes/setup";
import { wsRoutes } from "./routes/ws";

function serveIndexHtml() {
  const filePath = join(config.webDistPath, "index.html");
  if (!existsSync(filePath)) {
    return new Response("Dashboard build not found", { status: 503 });
  }
  return new Response(Bun.file(filePath), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function serveAsset(path: string): Response | null {
  const safePath = path.replace(/\.\./g, "");
  const filePath = join(config.webDistPath, safePath);
  if (!filePath.startsWith(config.webDistPath)) {
    return null;
  }
  const file = Bun.file(filePath);
  if (file.size === 0 && !existsSync(filePath)) {
    return null;
  }
  return new Response(file, {
    headers: file.type ? { "Content-Type": file.type } : undefined,
  });
}

export function createApp() {
  return new Elysia()
    .use(cors({ origin: true, credentials: true }))
    .use(setupRoutes)
    .use(authRoutes)
    .use(systemRoutes)
    .use(agentRoutes)
    .use(eventsRoutes)
    .use(wsRoutes)
    .get("/api/health", () => ({ ok: true }))
    .get("/", () => serveIndexHtml())
    .get("/*", ({ path }) => {
      if (
        path.startsWith("/api") ||
        path.startsWith("/auth") ||
        path.startsWith("/setup") ||
        path.startsWith("/system") ||
        path.startsWith("/agent") ||
        path.startsWith("/events") ||
        path.startsWith("/ws")
      ) {
        return new Response("NOT_FOUND", { status: 404 });
      }

      if (path.startsWith("/assets/")) {
        const asset = serveAsset(path);
        if (asset) return asset;
      }

      return serveIndexHtml();
    });
}
