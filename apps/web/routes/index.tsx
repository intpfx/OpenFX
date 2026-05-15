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
      </section>
    </AppShell>
  );
}
