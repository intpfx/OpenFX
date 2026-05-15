import { useSignal } from "@preact/signals";

import {
  createCounterState,
  decrementCounter,
  incrementCounter,
} from "../../../packages/core/src/mod.ts";

export default function Counter() {
  const counter = useSignal(createCounterState());

  return (
    <div class="counter">
      <button
        type="button"
        onClick={() => {
          counter.value = decrementCounter(counter.value);
        }}
      >
        -
      </button>
      <strong>{counter.value.value}</strong>
      <button
        type="button"
        onClick={() => {
          counter.value = incrementCounter(counter.value);
        }}
      >
        +
      </button>
    </div>
  );
}
