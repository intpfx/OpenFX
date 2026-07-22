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

type NitroProcess = Pick<Deno.ChildProcess, "kill" | "status">;

export interface NitroLifecycle {
  raceStartup<T>(phase: string, work: Promise<T>): Promise<T>;
  assertRunning(phase: string): void;
  stop(): Promise<Deno.CommandStatus>;
  waitForFinalStatus(): Promise<Deno.CommandStatus>;
  isStopping(): boolean;
}

export function createNitroLifecycle(nitro: NitroProcess): NitroLifecycle {
  let stopping = false;
  let exitedStatus: Deno.CommandStatus | undefined;
  let stopPromise: Promise<Deno.CommandStatus> | undefined;
  const status = nitro.status.then((result) => {
    exitedStatus = result;
    return result;
  });

  const stoppedError = () => new Error("Local pairing launcher stopped");
  const prematureExitError = (phase: string, result: Deno.CommandStatus) =>
    new Error(`Nitro exited before ${phase}: ${formatExitStatus(result)}`);
  const raceChildExit = <T>(phase: string): Promise<T> =>
    status.then((result) => {
      throw stopping ? stoppedError() : prematureExitError(phase, result);
    });

  return {
    raceStartup<T>(phase: string, work: Promise<T>): Promise<T> {
      return Promise.race([work, raceChildExit<T>(phase)]);
    },
    assertRunning(phase: string): void {
      if (stopping) throw stoppedError();
      if (exitedStatus) throw prematureExitError(phase, exitedStatus);
    },
    stop(): Promise<Deno.CommandStatus> {
      if (!stopPromise) {
        stopping = true;
        stopPromise = (async () => {
          if (!exitedStatus) {
            try {
              nitro.kill("SIGTERM");
            } catch {
              // The child may already have exited.
            }
          }
          return await status;
        })();
      }
      return stopPromise;
    },
    async waitForFinalStatus(): Promise<Deno.CommandStatus> {
      const result = await status;
      if (!stopping && !result.success) {
        throw new Error(`Nitro exited unsuccessfully: ${formatExitStatus(result)}`);
      }
      return result;
    },
    isStopping: () => stopping,
  };
}

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

  let lifecycle: NitroLifecycle | undefined;
  let tls: Deno.HttpServer | undefined;
  let client: Deno.HttpClient | undefined;
  let signalHandlersInstalled = false;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      if (signalHandlersInstalled) {
        Deno.removeSignalListener("SIGINT", onSignal);
        Deno.removeSignalListener("SIGTERM", onSignal);
        signalHandlersInstalled = false;
      }
      client?.close();
      await Promise.all([
        tls?.shutdown().catch(() => undefined),
        lifecycle?.stop(),
      ]);
    })();
    return cleanupPromise;
  };
  const onSignal = () => {
    void cleanup().catch((error) => {
      console.error("Local pairing cleanup failed", error);
    });
  };

  try {
    const nitro = new Deno.Command(Deno.execPath(), {
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
    lifecycle = createNitroLifecycle(nitro);
    Deno.addSignalListener("SIGINT", onSignal);
    Deno.addSignalListener("SIGTERM", onSignal);
    signalHandlersInstalled = true;

    await lifecycle.raceStartup(
      "waiting for health",
      waitForHttp(`http://127.0.0.1:${nitroPort}/api/health`),
    );
    lifecycle.assertRunning("starting the TLS proxy");

    const [certificate, privateKey] = await lifecycle.raceStartup(
      "loading TLS certificates",
      Promise.all([
        Deno.readTextFile(certificatePath),
        Deno.readTextFile(privateKeyPath),
      ]),
    );
    lifecycle.assertRunning("starting the TLS proxy");
    tls = Deno.serve({
      hostname: "127.0.0.1",
      port: tlsPort,
      cert: certificate,
      key: privateKey,
      onListen() {},
    }, createProxyHandler());

    client = Deno.createHttpClient({ caCerts: [rootCertificate] });
    const cookie = await lifecycle.raceStartup(
      "creating the admin session",
      createAdminSession(client),
    );
    lifecycle.assertRunning("creating the pairing");
    const pairingCode = await lifecycle.raceStartup(
      "creating the pairing",
      createPairing(client, cookie),
    );
    lifecycle.assertRunning("writing pairing information");
    await lifecycle.raceStartup(
      "writing pairing information",
      writePairingInfo(
        pairingInfoPath,
        pairingCode,
        cookie,
        rootCertificatePath,
      ),
    );
    lifecycle.assertRunning("reporting pairing readiness");
    console.log(`OPENFX_LOCAL_PAIRING_READY ${pairingInfoPath}`);

    await lifecycle.waitForFinalStatus();
  } catch (error) {
    if (lifecycle?.isStopping()) return;
    throw error;
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

function formatExitStatus(status: Deno.CommandStatus): string {
  return status.signal ? `signal ${status.signal}` : `exit code ${status.code}`;
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
