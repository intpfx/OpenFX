import { AppShell } from "@/components/AppShell.tsx";
import Counter from "@/islands/Counter.tsx";

import {
  createCounterState,
  createRuntimeHealth,
  incrementCounter,
} from "../../../packages/core/src/mod.ts";

const previewCounter = incrementCounter(createCounterState(2));
const webHealth = createRuntimeHealth({ surface: "web", version: "0.1.0" });

export default function Home() {
  return (
    <AppShell>
      <section class="hero">
        <span class="eyebrow">OpenFX / Web</span>
        <h1>以纯函数为优先的产品逻辑，在桌面端与 Web 端之间共享。</h1>
        <p>
          OpenFX 目前由 Perry 桌面应用与 Fresh + Deno Web 应用组成，两端共享同一套
          TypeScript 核心领域逻辑。
        </p>
      </section>

      <section class="grid">
        <a href="/downip" class="card card-link">
          <h2>DownIP</h2>
          <p>
            IPv6 动态域名映射服务。客户端上报本机 IPv6，服务端按 key 提供 HTTP 重定向。
          </p>
          <span class="card-arrow">→</span>
        </a>

        <article class="card">
          <h2>共享运行时健康信息</h2>
          <p class="mono">
            {webHealth.name} / {webHealth.surface} / {webHealth.status} /{" "}
            {webHealth.version}
          </p>
        </article>

        <article class="card">
          <h2>纯函数计数器预览</h2>
          <p>直接从 `packages/core` 读取预览，不依赖任何框架状态。</p>
          <p class="mono">previewCounter = {previewCounter.value}</p>
        </article>

        <article class="card">
          <h2>交互式 Island</h2>
          <p>仅在真正需要交互的区域启用 hydration。</p>
          <Counter />
        </article>
      </section>
    </AppShell>
  );
}
