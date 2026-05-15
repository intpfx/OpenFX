import { App, Button, State, Text, VStack } from "perry/ui";

import {
  createCounterState,
  createRuntimeHealth,
  incrementCounter,
} from "../../../packages/core/src/mod.ts";

const counter = State(createCounterState());
const health = createRuntimeHealth({ surface: "desktop", version: "0.1.0" });

App({
  title: "OpenFX Desktop",
  width: 420,
  height: 320,
  body: VStack(16, [
    Text("OpenFX Desktop"),
    Text(`Runtime: ${health.surface}`),
    Text(`Status: ${health.status}`),
    Text(`Counter: ${counter.value.value}`),
    Button("Increment", () => {
      counter.set(incrementCounter(counter.value));
    }),
  ]),
});
