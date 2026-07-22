import { fromFileUrl, join } from "jsr:@std/path@^1.1.4";

import {
  createLocalWebEnvironment,
  LOCAL_ADMIN_KEY,
  LOCAL_WEB_LOCATION,
} from "./local-pairing-environment.ts";

const repositoryRoot = new URL("../../../", import.meta.url);
const webRoot = new URL("entry/web/", repositoryRoot);
const nitroPort = 8_000;
const tlsPort = 34_431;
const origin = `https://127.0.0.1:${tlsPort}`;

export async function main(): Promise<void> {
  const inherited = Deno.env.toObject();
  const runtimeDirectory = inherited.OPENFX_LOCAL_RUNTIME?.trim();
  if (!runtimeDirectory) throw new Error("OPENFX_LOCAL_RUNTIME is required");

  await Deno.mkdir(runtimeDirectory, { recursive: true });
  await Deno.chmod(runtimeDirectory, 0o700);

  const credentialKey = inherited.OPENFX_NODE_CREDENTIAL_KEY?.trim() ||
    randomHex(16);
  const childEnvironment = createLocalWebEnvironment(
    inherited,
    runtimeDirectory,
    credentialKey,
  );
  const certificatePath = join(runtimeDirectory, "loopback.pem");
  const privateKeyPath = join(runtimeDirectory, "loopback-key.pem");
  const pairingInfoPath = join(runtimeDirectory, "pairing.json");
  const mkcert = inherited.OPENFX_MKCERT_BIN?.trim() || "mkcert";

  await command(mkcert, [
    "-cert-file",
    certificatePath,
    "-key-file",
    privateKeyPath,
    "localhost",
    "127.0.0.1",
    "::1",
  ]);
  const certificateRoot = (await command(mkcert, ["-CAROOT"])).trim();
  const rootCertificatePath = join(certificateRoot, "rootCA.pem");
  const rootCertificate = await Deno.readTextFile(rootCertificatePath);

  let nitro: Deno.ChildProcess | undefined;
  let tls: Deno.HttpServer | undefined;
  let client: Deno.HttpClient | undefined;
  let stopping = false;
  const cleanup = async () => {
    if (stopping) return;
    stopping = true;
    Deno.removeSignalListener("SIGINT", onSignal);
    Deno.removeSignalListener("SIGTERM", onSignal);
    try {
      nitro?.kill("SIGTERM");
    } catch {
      // The child may already have exited.
    }
    client?.close();
    await tls?.shutdown().catch(() => undefined);
  };
  const onSignal = () => void cleanup();

  try {
    nitro = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--location",
        LOCAL_WEB_LOCATION,
        "--unstable-kv",
        "-A",
        ".output/server/index.ts",
      ],
      cwd: fromFileUrl(webRoot),
      clearEnv: true,
      env: childEnvironment,
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();
    Deno.addSignalListener("SIGINT", onSignal);
    Deno.addSignalListener("SIGTERM", onSignal);

    await waitForHttp(`http://127.0.0.1:${nitroPort}/api/health`);
    assertRunning(stopping);

    const [certificate, privateKey] = await Promise.all([
      Deno.readTextFile(certificatePath),
      Deno.readTextFile(privateKeyPath),
    ]);
    assertRunning(stopping);
    tls = Deno.serve({
      hostname: "127.0.0.1",
      port: tlsPort,
      cert: certificate,
      key: privateKey,
      onListen() {},
    }, createProxyHandler());

    client = Deno.createHttpClient({ caCerts: [rootCertificate] });
    const cookie = await createAdminSession(client);
    assertRunning(stopping);
    const pairingCode = await createPairing(client, cookie);
    assertRunning(stopping);
    await writePairingInfo(
      pairingInfoPath,
      pairingCode,
      cookie,
      rootCertificatePath,
    );
    console.log(`OPENFX_LOCAL_PAIRING_READY ${pairingInfoPath}`);

    await nitro.status;
  } finally {
    await cleanup();
  }
}

function createProxyHandler(): (request: Request) => Promise<Response> {
  return async (request) => {
    const source = new URL(request.url);
    const target = new URL(
      source.pathname + source.search,
      `http://127.0.0.1:${nitroPort}`,
    );
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-proto", "https");
    try {
      return await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
        redirect: "manual",
      });
    } catch (error) {
      console.error(
        `TLS ${request.method} ${source.pathname}${source.search} failed`,
        error,
      );
      return Response.json({ ok: false, error: "local_tls_proxy_failed" }, {
        status: 502,
      });
    }
  };
}

async function createAdminSession(client: Deno.HttpClient): Promise<string> {
  const login = await fetchWithClient(`${origin}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: LOCAL_ADMIN_KEY }),
  }, client);
  if (login.status !== 200) {
    throw new Error(`admin login failed: ${login.status}`);
  }
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  if (!cookie.startsWith("openfx_admin_session=")) {
    throw new Error("admin session cookie missing");
  }
  return cookie;
}

async function createPairing(
  client: Deno.HttpClient,
  cookie: string,
): Promise<string> {
  const pairing = await fetchWithClient(`${origin}/api/console/pairings`, {
    method: "POST",
    headers: { cookie },
  }, client);
  const pairingBody = await pairing.json() as Record<string, unknown>;
  if (pairing.status !== 201 || typeof pairingBody.code !== "string") {
    throw new Error(`pairing creation failed: ${pairing.status}`);
  }
  return pairingBody.code;
}

async function writePairingInfo(
  pairingInfoPath: string,
  pairingCode: string,
  cookie: string,
  rootCertificatePath: string,
): Promise<void> {
  await Deno.writeTextFile(
    pairingInfoPath,
    JSON.stringify(
      {
        origin,
        pairingCode,
        cookie,
        adminKey: LOCAL_ADMIN_KEY,
        rootCertificatePath,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  await Deno.chmod(pairingInfoPath, 0o600);
}

async function command(executable: string, args: string[]): Promise<string> {
  const output = await new Deno.Command(executable, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }
  return new TextDecoder().decode(output.stdout);
}

function fetchWithClient(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  client: Deno.HttpClient,
): ReturnType<typeof fetch> {
  const denoFetch = globalThis.fetch as unknown as (
    resource: Parameters<typeof fetch>[0],
    requestInit?: RequestInit & { client: Deno.HttpClient },
  ) => ReturnType<typeof fetch>;
  return denoFetch(input, { ...init, client });
}

function randomHex(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function assertRunning(stopping: boolean): void {
  if (stopping) throw new Error("Local pairing launcher stopped");
}

async function waitForHttp(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
    } catch {
      // Nitro is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

if (import.meta.main) await main();
