import { AppShell } from "@/components/AppShell.tsx";
import Counter from "@/islands/Counter.tsx";

import {
  buildIpv6ReportPayload,
  createCounterState,
  createRuntimeHealth,
  incrementCounter,
} from "../../../packages/core/src/mod.ts";
import { getRedirectConfig } from "@/utils/downip.ts";
import { isProxyEnabled } from "@/utils/proxy.ts";

const previewCounter = incrementCounter(createCounterState(2));
const webHealth = createRuntimeHealth({ surface: "web", version: "0.1.0" });
const samplePayload = buildIpv6ReportPayload("home", "2001:db8::1", 3000);
const redirectConfig = getRedirectConfig();
const proxyEnabled = isProxyEnabled();

export default function Home() {
  return (
    <AppShell>
      <section class="hero">
        <span class="eyebrow">OpenFX / Web</span>
        <h1>Pure-function-first product logic, shared across desktop and web.</h1>
        <p>
          OpenFX starts with a Perry desktop shell and a Fresh + Deno web surface, both
          driven by the same core TypeScript domain functions.
        </p>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Shared runtime health</h2>
          <p class="mono">
            {webHealth.name} / {webHealth.surface} / {webHealth.status} /{" "}
            {webHealth.version}
          </p>
        </article>

        <article class="card">
          <h2>Pure counter preview</h2>
          <p>Previewed from `packages/core` without any framework state.</p>
          <p class="mono">previewCounter = {previewCounter.value}</p>
        </article>

        <article class="card">
          <h2>Interactive island</h2>
          <p>Hydration is used only where interaction is needed.</p>
          <Counter />
        </article>

        <article class="card card-wide">
          <h2>DownIP server is now part of the web app</h2>
          <p>
            原先 `temp/crondownip.ts` 的服务端职责已迁移到 Fresh 路由中，部署 Web
            应用后即可直接提供 IPv6 映射更新与重定向能力。
          </p>
          <ul>
            <li><span class="mono">POST /update</span>：接收客户端上报的 key → IPv6 映射</li>
            <li><span class="mono">GET /update</span>：返回当前已存储的映射</li>
            <li><span class="mono">GET /:key/*</span>：按 key 302 重定向到目标 IPv6 服务</li>
          </ul>
          <p class="mono">redirect scheme = {redirectConfig.scheme}</p>
          <p class="mono">
            redirect port override = {redirectConfig.port ?? "(use uploaded port)"}
          </p>
        </article>

        <article class="card card-wide">
          <h2>How to use DownIP</h2>
          <p>桌面端或任意客户端向 Web 服务的 `/update` 端点发送 JSON 即可更新映射。</p>
          <pre class="code-block">{JSON.stringify(samplePayload, null, 2)}</pre>
          <p>
            更新后访问 <span class="mono">/home/your/path</span>，服务将重定向到对应 IPv6
            地址上的路径。
          </p>
        </article>

        <article class="card card-wide">
          <h2>Optional proxy capability</h2>
          <p>
            原先 `temp/proxy.ts` 的能力没有默认常驻开放，而是作为可选 Web 代理路由
            提供：<span class="mono">/api/proxy/*</span>
          </p>
          <p class="mono">OPENFX_PROXY_UPSTREAM = {proxyEnabled ? "configured" : "not configured"}</p>
          <p>
            仅当部署环境设置了 <span class="mono">OPENFX_PROXY_UPSTREAM</span> 后该能力才可用，
            以避免默认暴露开放代理。
          </p>
        </article>
      </section>
    </AppShell>
  );
}
