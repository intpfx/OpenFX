export interface PerryState<T> {
  value: T;
  set(nextValue: T): void;
}

type Widget = unknown;

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

export const TextField = (
  placeholder: string,
  onChange: (value: string) => void,
) => ({
  placeholder,
  onChange,
});

export const Toggle = (
  label: string,
  onChange: (value: boolean) => void,
) => ({
  label,
  onChange,
});

export const Divider = () => ({ type: "divider" });

export const Spacer = () => ({ type: "spacer" });

export const HStack = (spacing: number, children: unknown[]) => ({
  spacing,
  children,
  axis: "horizontal",
});

export const VStack = (spacing: number, children: unknown[]) => ({
  spacing,
  children,
  axis: "vertical",
});

export const Section = (title: string) => ({
  title,
  children: [] as Widget[],
});

export const widgetAddChild = (
  section: { children: Widget[] },
  child: Widget,
): void => {
  section.children.push(child);
};

export const clipboardWrite = (_text: string): void => {
  // Deno/LSP stub only.
};

export const stateBindTextfield = <T>(
  _state: PerryState<T>,
  _field: unknown,
): void => {
  // Deno/LSP stub only.
};

export const App = (_config: {
  title: string;
  width: number;
  height: number;
  body: unknown;
}): void => {
  // Deno/LSP stub only. Real builds are handled by Perry.
};
