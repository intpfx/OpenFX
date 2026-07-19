export interface PerryState<T> {
  value: T;
  set(nextValue: T): void;
}

export type Widget = unknown;

export interface Canvas {
  setFillColor(r: number, g: number, b: number, a: number): void;
  setStrokeColor(r: number, g: number, b: number, a: number): void;
  setLineWidth(width: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
}

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

export const toggleSetState = (_widget: Widget, _on: number): void => {};

export const Divider = () => ({ type: "divider" });

export const Spacer = () => ({ type: "spacer" });

export const Canvas = (_width: number, _height: number): Canvas => ({
  setFillColor() {},
  setStrokeColor() {},
  setLineWidth() {},
  fillRect() {},
  clearRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  closePath() {},
  fill() {},
  stroke() {},
});

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
export const widgetSetWidth = (_widget: Widget, _width: number): void => {};
export const widgetSetHeight = (_widget: Widget, _height: number): void => {};
export const widgetSetHidden = (_widget: Widget, _hidden: number): void => {};
export const widgetSetBackgroundColor = (
  _widget: Widget,
  _r: number,
  _g: number,
  _b: number,
  _a: number,
): void => {};
export const widgetSetEdgeInsets = (
  _widget: Widget,
  _top: number,
  _left: number,
  _bottom: number,
  _right: number,
): void => {};
export const stackSetAlignment = (_widget: Widget, _alignment: number): void => {};
export const stackSetDetachesHidden = (_widget: Widget, _detach: number): void => {};
export const textSetString = (_widget: Widget, _text: string): void => {};
export const textSetColor = (
  _widget: Widget,
  _r: number,
  _g: number,
  _b: number,
  _a: number,
): void => {};
export const textSetFontSize = (_widget: Widget, _size: number): void => {};
export const textSetFontWeight = (
  _widget: Widget,
  _size: number,
  _weight: number,
): void => {};
export const textSetWraps = (_widget: Widget, _maxWidth: number): void => {};
export const textfieldSetString = (_widget: Widget, _text: string): void => {};
export const buttonSetTitle = (_widget: Widget, _title: string): void => {};
export const buttonSetBordered = (_widget: Widget, _bordered: number): void => {};

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
  minWidth?: number;
  minHeight?: number;
  vibrancy?: string;
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
export const onFrame = (_callback: (timestampMs: number, deltaMs: number) => void) => 1;
export const cancelFrame = (_id: number): void => {};
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
export const onActivate = (_callback: () => void): void => {};
export const onMainWindowVisibilityChanged = (
  _callback: (visible: boolean) => void,
): void => {};
export const onTerminate = (_callback: () => void): void => {};
