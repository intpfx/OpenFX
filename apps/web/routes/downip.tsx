import { AppShell } from "@/components/AppShell.tsx";

import { buildIpv6ReportPayload } from "../../../packages/core/src/mod.ts";
import { getRedirectConfig } from "@/utils/downip.ts";
import { isProxyEnabled } from "@/utils/proxy.ts";

const samplePayload = buildIpv6ReportPayload("home", "2001:db8::1", 3000);
const redirectConfig = getRedirectConfig();
const proxyEnabled = isProxyEnabled();

export default function DownIPPage() {
  return (
    <AppShell>
      <section class="hero">
        <span class="eyebrow">
          <a href="/" class="back-link">← 返回首页</a>
        </span>
        <h1>DownIP</h1>
        <p>
          IPv6 动态域名映射服务。客户端上报本机 IPv6，服务端按 key 提供重定向。
        </p>
      </section>

      <section class="grid">
        <article class="card card-wide">
          <h2>API 端点</h2>
          <ul>
            <li>
              <span class="mono">POST /update</span>：接收客户端上报的 key → IPv6 映射
            </li>
            <li>
              <span class="mono">GET /update</span>：返回当前已存储的映射
            </li>
            <li>
              <span class="mono">GET /:key/*</span>：按 key 302 重定向到目标 IPv6 服务
            </li>
          </ul>
          <p class="mono">重定向协议 = {redirectConfig.scheme}</p>
          <p class="mono">
            重定向端口覆盖 = {redirectConfig.port ?? "（默认使用客户端上报端口）"}
          </p>
        </article>

        <article class="card card-wide">
          <h2>如何使用</h2>
          <p>桌面端或任意客户端向 Web 服务的 `/update` 端点发送 JSON 即可更新映射。</p>
          <pre class="code-block">{JSON.stringify(samplePayload, null, 2)}</pre>
          <p>
            更新后访问{" "}
            <span class="mono">/home/your/path</span>，服务将重定向到对应 IPv6
            地址上的路径。
          </p>
        </article>

        <article class="card card-wide">
          <h2>可选代理能力</h2>
          <p>
            原先 `temp/proxy.ts` 的能力没有默认常驻开放，而是作为可选 Web 代理路由
            提供：<span class="mono">/api/proxy/*</span>
          </p>
          <p class="mono">
            OPENFX_PROXY_UPSTREAM = {proxyEnabled ? "已配置" : "未配置"}
          </p>
          <p>
            仅当部署环境设置了 <span class="mono">OPENFX_PROXY_UPSTREAM</span>{" "}
            后该能力才可用，以避免默认暴露开放代理。
          </p>
        </article>
      </section>
    </AppShell>
  );
}
