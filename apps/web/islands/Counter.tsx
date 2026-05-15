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
        aria-label="减少计数"
      >
        -
      </button>
      <strong>{counter.value.value}</strong>
      <button
        type="button"
        onClick={() => {
          counter.value = incrementCounter(counter.value);
        }}
        aria-label="增加计数"
      >
        +
      </button>
    </div>
  );
}
