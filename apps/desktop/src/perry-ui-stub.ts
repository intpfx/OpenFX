export interface PerryState<T> {
  value: T;
  set(nextValue: T): void;
}

export const State = <T>(initialValue: T): PerryState<T> => ({
  value: initialValue,
  set(nextValue) {
    this.value = nextValue;
  },
});

export const Text = (value: string): string => value;

export const Button = (label: string, onClick: () => void) => ({
  label,
  onClick,
});

export const VStack = (spacing: number, children: unknown[]) => ({
  spacing,
  children,
});

export const App = (_config: {
  title: string;
  width: number;
  height: number;
  body: unknown;
}): void => {
  // Deno/LSP stub only. Real builds are handled by Perry.
};
