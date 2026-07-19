export interface PerryState<T> {
  value: T;
  set(nextValue: T): void;
}

type Widget = unknown;

export interface PerryWindow {
  setBody(body: Widget): void;
  show(): void;
  hide(): void;
  closeWindow(): void;
  onFocusLost(callback: () => void): void;
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

export const Window = (
  _title: string,
  _width: number,
  _height: number,
): PerryWindow => ({
  setBody() {},
  show() {},
  hide() {},
  closeWindow() {},
  onFocusLost() {},
});

export const trayCreate = (_iconPath: string): Widget => ({});
export const traySetTooltip = (_tray: Widget, _tooltip: string): void => {};
export const trayAttachMenu = (_tray: Widget, _menu: Widget): void => {};
export const trayOnClick = (_tray: Widget, _callback: () => void): void => {};
export const appSetActivationPolicy = (
  _policy: "regular" | "accessory" | "background",
): void => {};
export const appSetTimer = (
  _intervalMs: number,
  _callback: () => void,
): void => {};
export const menuCreate = (): Widget => ({});
export const menuAddItem = (
  _menu: Widget,
  _label: string,
  _callback: () => void,
): void => {};
export const menuAddSeparator = (_menu: Widget): void => {};
export const menuAddStandardAction = (
  _menu: Widget,
  _label: string,
  _selector: string,
  _keyEquivalent: string,
): void => {};
export const onTerminate = (_callback: () => void): void => {};
