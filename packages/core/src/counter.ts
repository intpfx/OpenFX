export interface CounterState {
  readonly value: number;
}

export const createCounterState = (value = 0): CounterState => ({ value });

export const incrementCounter = (
  state: CounterState,
  step = 1,
): CounterState => ({
  value: state.value + step,
});

export const decrementCounter = (
  state: CounterState,
  step = 1,
): CounterState => ({
  value: state.value - step,
});
