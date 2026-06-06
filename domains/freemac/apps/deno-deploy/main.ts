type TargetProtocol = "http" | "https";

interface StoredTarget {
  ipv6: string;
  port: number;
  protocol: TargetProtocol;
  updatedAt: string;
  source?: string;
}

const kv = await Deno.openKv();
const TARGET_KEY = ["freemac", "latest-target"] as const;
const HISTORY_KEY = ["freemac", "history"] as const;
const UPDATE_TOKEN = Deno.env.get("FREEMAC_UPDATE_TOKEN") || "";
const PROXIED_PREFIXES = [
  "/assets/",
  "/auth/",
  "/system/",
  "/setup/",
  "/agent/",
  "/events/",
  "/ws/",
];

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidIpv6(ipv6: string): boolean {
  return ipv6.includes(":") && !/[\s[\]/]/.test(ipv6);
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function buildAccessUrl(target: StoredTarget): string {
  return `${target.protocol}://[${target.ipv6}]:${target.port}`;
}

function shouldProxy(url: URL): boolean {
  if (url.pathname === "/app" || url.pathname === "/app/") {
    return true;
  }

  if (
    url.pathname.startsWith("/api/") &&
    url.pathname !== "/api/report" &&
    url.pathname !== "/api/status"
  ) {
    return true;
  }

  return PROXIED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function buildProxyUrl(requestUrl: URL, target: StoredTarget): URL {
  const upstream = new URL(buildAccessUrl(target));
  if (requestUrl.pathname === "/app" || requestUrl.pathname === "/app/") {
    upstream.pathname = "/";
    upstream.search = requestUrl.search;
    return upstream;
  }

  upstream.pathname = requestUrl.pathname;
  upstream.search = requestUrl.search;
  return upstream;
}

async function proxyToTarget(
  request: Request,
  requestUrl: URL,
  target: StoredTarget,
): Promise<Response> {
  const upstreamUrl = buildProxyUrl(requestUrl, target);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-length");
  responseHeaders.set("x-freemac-relay", "deno-proxy");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function loadTarget(): Promise<StoredTarget | null> {
  const result = await kv.get<StoredTarget>(TARGET_KEY);
  return result.value;
}

async function saveTarget(target: StoredTarget): Promise<void> {
  const historyKey = [...HISTORY_KEY, target.updatedAt] as const;
  await kv
    .atomic()
    .set(TARGET_KEY, target)
    .set(historyKey, target, { expireIn: 1000 * 60 * 60 * 24 * 30 })
    .commit();
}

function authorized(request: Request): boolean {
  if (!UPDATE_TOKEN) {
    return true;
  }
  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${UPDATE_TOKEN}`;
}

function renderPage(target: StoredTarget | null, requestUrl: URL): string {
  const title = target ? `freemac relay` : "freemac relay";
  const proxyUrl = target ? `${requestUrl.origin}/app` : "";
  const targetJson = target ? JSON.stringify(target) : "null";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --hud-bg: rgba(15, 23, 42, 0.72);
        --hud-border: rgba(100, 116, 139, 0.28);
        --hud-text: #e2e8f0;
        --hud-dim: #94a3b8;
        --accent: #3b82f6;
        --accent-glow: rgba(59, 130, 246, 0.3);
        --success: #22c55e;
        --warn: #f59e0b;
        --danger: #ef4444;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; margin: 0; }
      html, body { height: 100%; overflow: hidden; background: #0a0a0f; color: var(--hud-text); }

      /* ── fullscreen iframe ── */
      #app-frame {
        position: fixed; inset: 0; z-index: 1;
        width: 100%; height: 100%; border: 0;
        background: #0a0a0f;
        display: none;
      }

      /* ── capsule HUD ── */
      #hud {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        z-index: 1000;
        display: none; align-items: center; gap: 10px;
        padding: 6px 16px 6px 12px;
        border-radius: 999px;
        background: var(--hud-bg);
        border: 1px solid var(--hud-border);
        backdrop-filter: blur(20px) saturate(1.4);
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        font-size: 12px;
        transition: opacity 0.3s, transform 0.3s;
        cursor: default;
        user-select: none;
      }
      #hud.minimized {
        padding: 6px 10px;
        gap: 6px;
      }
      #hud.minimized .hud-detail { display: none; }
      .hud-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--success);
        box-shadow: 0 0 6px var(--success);
        flex-shrink: 0;
      }
      .hud-dot.warn { background: var(--warn); box-shadow: 0 0 6px var(--warn); }
      .hud-dot.error { background: var(--danger); box-shadow: 0 0 6px var(--danger); }
      .hud-dot.offline { background: #64748b; box-shadow: none; }
      .hud-label { color: var(--hud-text); font-weight: 500; white-space: nowrap; }
      .hud-detail { color: var(--hud-dim); white-space: nowrap; font-family: ui-monospace, monospace; font-size: 11px; }
      .hud-sep { width: 1px; height: 14px; background: var(--hud-border); flex-shrink: 0; }
      .hud-btn {
        background: none; border: none; color: var(--hud-dim); cursor: pointer;
        padding: 2px 4px; font-size: 13px; line-height: 1;
        transition: color 0.2s;
      }
      .hud-btn:hover { color: var(--hud-text); }
      .hud-btn.upload-btn { font-size: 14px; }

      /* ── gate (login / init / offline) ── */
      #gate {
        position: fixed; inset: 0; z-index: 500;
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(ellipse at 50% 30%, #0f172a, #020617 70%);
      }
      .gate-card {
        width: 100%; max-width: 360px; padding: 40px 32px;
        border-radius: 24px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid var(--hud-border);
        backdrop-filter: blur(24px);
        box-shadow: 0 24px 64px rgba(0,0,0,0.5);
        text-align: center;
      }
      .gate-orb {
        width: 64px; height: 64px; margin: 0 auto 24px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #60a5fa, #2563eb);
        box-shadow: 0 0 40px var(--accent-glow);
        animation: pulse 2.5s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { box-shadow: 0 0 40px var(--accent-glow); transform: scale(1); }
        50% { box-shadow: 0 0 60px rgba(59,130,246,0.5); transform: scale(1.05); }
      }
      .gate-title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
      .gate-sub { font-size: 13px; color: var(--hud-dim); margin-bottom: 28px; line-height: 1.5; }
      .gate-input {
        display: block; width: 100%; padding: 12px 16px;
        border-radius: 12px; border: 1px solid var(--hud-border);
        background: rgba(30, 41, 59, 0.6);
        color: var(--hud-text); font-size: 14px;
        outline: none; transition: border-color 0.2s;
      }
      .gate-input:focus { border-color: var(--accent); }
      .gate-input::placeholder { color: #475569; }
      .gate-submit {
        display: block; width: 100%; margin-top: 16px;
        padding: 12px; border: none; border-radius: 12px;
        background: var(--accent); color: #fff;
        font-size: 14px; font-weight: 600; cursor: pointer;
        transition: background 0.2s, transform 0.1s;
      }
      .gate-submit:hover { background: #2563eb; }
      .gate-submit:active { transform: scale(0.98); }
      .gate-submit:disabled { opacity: 0.5; cursor: not-allowed; }
      .gate-error {
        margin-top: 12px; font-size: 12px; color: var(--danger);
        min-height: 18px;
      }
      .gate-upload-zone {
        margin-top: 20px; padding: 20px;
        border: 2px dashed var(--hud-border);
        border-radius: 16px;
        color: var(--hud-dim); font-size: 13px;
        cursor: pointer; transition: border-color 0.2s, color 0.2s;
      }
      .gate-upload-zone:hover, .gate-upload-zone.dragover {
        border-color: var(--accent); color: var(--hud-text);
      }
      .gate-upload-zone input { display: none; }

      /* ── offline state ── */
      .gate-offline .gate-orb {
        background: radial-gradient(circle at 30% 30%, #94a3b8, #475569);
        box-shadow: 0 0 30px rgba(100,116,139,0.2);
        animation: pulse-dim 3s ease-in-out infinite;
      }
      @keyframes pulse-dim {
        0%, 100% { opacity: 0.6; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.03); }
      }

      /* ── transitions ── */
      .fade-out { opacity: 0; pointer-events: none; transition: opacity 0.4s ease; }
      .hidden { display: none !important; }
    </style>
  </head>
  <body>
    <!-- Gate: login / init / offline -->
    <div id="gate">
      <div class="gate-card">
        <div class="gate-orb"></div>
        <div id="gate-content"></div>
      </div>
    </div>

    <!-- Fullscreen app iframe -->
    <iframe id="app-frame" title="freemac" referrerpolicy="no-referrer"></iframe>

    <!-- Capsule HUD -->
    <div id="hud">
      <div class="hud-dot" id="hud-dot"></div>
      <span class="hud-label" id="hud-label">connected</span>
      <span class="hud-detail" id="hud-detail"></span>
      <div class="hud-sep hud-detail"></div>
      <button class="hud-btn upload-btn hud-detail" id="hud-upload" title="Upload file">&#8679;</button>
      <div class="hud-sep"></div>
      <button class="hud-btn" id="hud-toggle" title="Minimize">&#x2015;</button>
    </div>

    <!-- Hidden upload input -->
    <input type="file" id="file-input" multiple style="display:none" />

    <script>
    (function() {
      const target = ${targetJson};
      const proxyBase = ${JSON.stringify(proxyUrl)};
      const gate = document.getElementById("gate");
      const gateContent = document.getElementById("gate-content");
      const frame = document.getElementById("app-frame");
      const hud = document.getElementById("hud");
      const hudDot = document.getElementById("hud-dot");
      const hudLabel = document.getElementById("hud-label");
      const hudDetail = document.getElementById("hud-detail");
      const hudToggle = document.getElementById("hud-toggle");
      const hudUpload = document.getElementById("hud-upload");
      const fileInput = document.getElementById("file-input");

      let sessionId = localStorage.getItem("freemac-session") || "";

      /* ── helpers ── */
      async function api(method, path, body) {
        const headers = { "Content-Type": "application/json" };
        if (sessionId) headers["x-session-id"] = sessionId;
        const r = await fetch(path, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        return r.json();
      }

      function showGate(html) {
        gateContent.innerHTML = html;
        gate.classList.remove("fade-out", "hidden");
      }

      function hideGate() {
        gate.classList.add("fade-out");
        setTimeout(() => gate.classList.add("hidden"), 400);
      }

      function showApp() {
        frame.src = proxyBase;
        frame.style.display = "block";
        hud.style.display = "flex";
        hideGate();
        updateHud("connected", target ? target.ipv6.slice(-12) + ":" + target.port : "");
      }

      function updateHud(status, detail) {
        hudDot.className = "hud-dot" + (status === "connected" ? "" : status === "warn" ? " warn" : status === "error" ? " error" : " offline");
        hudLabel.textContent = status;
        hudDetail.textContent = detail || "";
      }

      /* ── offline ── */
      function renderOffline() {
        gate.querySelector(".gate-card").classList.add("gate-offline");
        showGate(
          '<div class="gate-title">Waiting for Mac</div>' +
          '<div class="gate-sub">No target has reported yet.<br>The page will refresh automatically.</div>'
        );
        setTimeout(() => location.reload(), 15000);
      }

      /* ── init ── */
      function renderInit() {
        showGate(
          '<div class="gate-title">Initialize freemac</div>' +
          '<div class="gate-sub">Set a password to secure remote access.</div>' +
          '<input class="gate-input" id="init-pw" type="password" placeholder="Password (8+ chars)" autocomplete="new-password" />' +
          '<button class="gate-submit" id="init-btn">Initialize</button>' +
          '<div class="gate-error" id="init-err"></div>'
        );
        const btn = document.getElementById("init-btn");
        const pw = document.getElementById("init-pw");
        const err = document.getElementById("init-err");
        btn.onclick = async () => {
          const val = pw.value.trim();
          if (val.length < 8) { err.textContent = "Password must be at least 8 characters"; return; }
          btn.disabled = true; btn.textContent = "Initializing…";
          try {
            const res = await api("POST", "/setup/init", { password: val });
            if (res.ok) { await doLogin(val); }
            else { err.textContent = res.message || "Failed"; btn.disabled = false; btn.textContent = "Initialize"; }
          } catch(e) { err.textContent = "Network error"; btn.disabled = false; btn.textContent = "Initialize"; }
        };
        pw.onkeydown = (e) => { if (e.key === "Enter") btn.click(); };
      }

      /* ── login ── */
      function renderLogin() {
        showGate(
          '<div class="gate-title">freemac</div>' +
          '<div class="gate-sub">Enter your password to connect.</div>' +
          '<input class="gate-input" id="login-pw" type="password" placeholder="Password" autocomplete="current-password" />' +
          '<button class="gate-submit" id="login-btn">Connect</button>' +
          '<div class="gate-error" id="login-err"></div>' +
          '<div class="gate-upload-zone" id="gate-upload">' +
            '<input type="file" id="gate-file" multiple />' +
            '&#8679; Drop files here or click to upload' +
          '</div>'
        );
        const btn = document.getElementById("login-btn");
        const pw = document.getElementById("login-pw");
        const err = document.getElementById("login-err");
        btn.onclick = async () => {
          const val = pw.value.trim();
          if (!val) { err.textContent = "Enter your password"; return; }
          btn.disabled = true; btn.textContent = "Connecting…";
          await doLogin(val);
          if (!sessionId) { err.textContent = "Invalid password"; btn.disabled = false; btn.textContent = "Connect"; }
        };
        pw.onkeydown = (e) => { if (e.key === "Enter") btn.click(); };

        // upload zone on login page
        const zone = document.getElementById("gate-upload");
        const gateFile = document.getElementById("gate-file");
        zone.onclick = () => gateFile.click();
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("dragover"); };
        zone.ondragleave = () => zone.classList.remove("dragover");
        zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove("dragover"); uploadFiles(e.dataTransfer.files); };
        gateFile.onchange = () => { if (gateFile.files.length) uploadFiles(gateFile.files); };
      }

      async function doLogin(password) {
        try {
          const res = await api("POST", "/auth/login", { password });
          if (res.ok && res.sessionId) {
            sessionId = res.sessionId;
            localStorage.setItem("freemac-session", sessionId);
            showApp();
          }
        } catch(e) { /* handled by caller */ }
      }

      /* ── upload ── */
      async function uploadFiles(files) {
        for (const file of files) {
          const form = new FormData();
          form.append("file", file);
          try {
            const headers = {};
            if (sessionId) headers["x-session-id"] = sessionId;
            await fetch("/api/upload", { method: "POST", headers, body: form });
          } catch(e) { console.warn("upload failed:", e); }
        }
      }

      /* ── HUD controls ── */
      hudToggle.onclick = () => {
        hud.classList.toggle("minimized");
        hudToggle.innerHTML = hud.classList.contains("minimized") ? "&#x25CB;" : "&#x2015;";
      };

      hudUpload.onclick = () => fileInput.click();
      fileInput.onchange = () => { if (fileInput.files.length) uploadFiles(fileInput.files); };

      /* ── boot ── */
      async function boot() {
        if (!target) { renderOffline(); return; }
        try {
          const status = await api("GET", "/setup/status");
          if (!status.ok) { renderOffline(); return; }

          if (!status.status.initialized) { renderInit(); return; }

          if (sessionId) {
            const auth = await api("GET", "/auth/status");
            if (auth.ok && auth.authenticated) { showApp(); return; }
            sessionId = "";
            localStorage.removeItem("freemac-session");
          }

          renderLogin();
        } catch(e) {
          updateHud("error", "unreachable");
          renderOffline();
        }
      }

      boot();
    })();
    </script>
  </body>
</html>`;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (request.headers.get("upgrade")?.toLowerCase() === "websocket" && shouldProxy(url)) {
    const target = await loadTarget();
    if (!target) {
      return new Response("freemac target is not available yet", { status: 503 });
    }

    const { socket: clientSocket, response } = Deno.upgradeWebSocket(request);
    const upstreamUrl = buildProxyUrl(url, target);
    upstreamUrl.protocol = target.protocol === "https" ? "wss:" : "ws:";
    const upstream = new WebSocket(upstreamUrl.toString());

    upstream.onopen = () => {
      clientSocket.onmessage = (event) => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(event.data);
        }
      };
    };

    upstream.onmessage = (event) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(event.data);
      }
    };

    upstream.onclose = () => {
      try {
        clientSocket.close();
      } catch {
        /* already closed */
      }
    };

    upstream.onerror = () => {
      try {
        clientSocket.close();
      } catch {
        /* already closed */
      }
    };

    clientSocket.onclose = () => {
      try {
        upstream.close();
      } catch {
        /* already closed */
      }
    };

    clientSocket.onerror = () => {
      try {
        upstream.close();
      } catch {
        /* already closed */
      }
    };

    return response;
  }

  if (shouldProxy(url)) {
    const target = await loadTarget();
    if (!target) {
      return new Response("freemac target is not available yet", { status: 503 });
    }

    try {
      return await proxyToTarget(request, url, target);
    } catch (error) {
      return json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Proxy request failed",
        },
        { status: 502 },
      );
    }
  }

  if (request.method === "GET" && url.pathname === "/") {
    const target = await loadTarget();
    return new Response(renderPage(target, url), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    const target = await loadTarget();
    return json({ ok: true, target, accessUrl: target ? buildAccessUrl(target) : null });
  }

  if (request.method === "POST" && url.pathname === "/api/report") {
    if (!authorized(request)) {
      return json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as Partial<StoredTarget> | null;
    if (!payload || typeof payload.ipv6 !== "string" || typeof payload.port !== "number") {
      return json({ ok: false, message: "Invalid payload" }, { status: 400 });
    }

    const protocol: TargetProtocol = payload.protocol === "https" ? "https" : "http";
    const ipv6 = payload.ipv6.trim().toLowerCase();
    const port = payload.port;

    if (!isValidIpv6(ipv6)) {
      return json({ ok: false, message: "Invalid IPv6 address" }, { status: 400 });
    }

    if (!isValidPort(port)) {
      return json({ ok: false, message: "Invalid port" }, { status: 400 });
    }

    const target: StoredTarget = {
      ipv6,
      port,
      protocol,
      updatedAt: new Date().toISOString(),
      source: typeof payload.source === "string" ? payload.source.trim().slice(0, 120) : undefined,
    };

    await saveTarget(target);
    return json({ ok: true, target, accessUrl: buildAccessUrl(target) });
  }

  return json({ ok: false, message: "Not found" }, { status: 404 });
});
