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

export interface Window {
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

export const ZStack = () => ({
  children: [] as Widget[],
  axis: "depth",
});

export const ScrollView = () => ({
  child: null as Widget | null,
  type: "scroll-view",
});

export const ImageFile = (path: string): Widget => ({ path, type: "image" });

export const ImageSymbol = (name: string): Widget => ({ name, type: "symbol" });

export const VideoFile = (path: string): Widget => ({ path, type: "video" });

export const Section = (title: string) => ({
  title,
  children: [] as Widget[],
});

export const widgetAddChild = (
  section: Widget,
  child: Widget,
): void => {
  const parent = section as { children?: Widget[] };
  if (!parent.children) parent.children = [];
  parent.children.push(child);
};
export const widgetClearChildren = (
  section: Widget,
): void => {
  const parent = section as { children?: Widget[] };
  if (parent.children) parent.children.splice(0, parent.children.length);
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
export const widgetSetTooltip = (_widget: Widget, _text: string): void => {};
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
export const textSetTextAlignment = (
  _widget: Widget,
  _alignment: number,
): void => {};
export const textfieldSetString = (_widget: Widget, _text: string): void => {};
export const buttonSetTitle = (_widget: Widget, _title: string): void => {};
export const buttonSetBordered = (_widget: Widget, _bordered: number): void => {};
export const buttonSetImage = (_widget: Widget, _symbolName: string): void => {};
export const buttonSetImagePosition = (
  _widget: Widget,
  _position: number,
): void => {};
export const buttonSetTextColor = (
  _widget: Widget,
  _r: number,
  _g: number,
  _b: number,
  _a: number,
): void => {};
export const imageSetSize = (
  _widget: Widget,
  _width: number,
  _height: number,
): void => {};
export const imageSetScaling = (
  _widget: Widget,
  _scaling: number,
): void => {};
export const imageSetTint = (
  _widget: Widget,
  _r: number,
  _g: number,
  _b: number,
  _a: number,
): void => {};
export const videoSetPlaying = (
  _widget: Widget,
  _playing: number,
): void => {};
export const scrollviewSetChild = (
  scrollView: Widget,
  child: Widget,
): void => {
  (scrollView as { child?: Widget | null }).child = child;
};
export const widgetAddOverlay = (
  parent: Widget,
  overlay: Widget,
): void => {
  const container = parent as { overlays?: Widget[] };
  if (!container.overlays) container.overlays = [];
  container.overlays.push(overlay);
};
export const widgetSetOverlayFrame = (
  _widget: Widget,
  _x: number,
  _y: number,
  _width: number,
  _height: number,
): void => {};
export const widgetSetOnClick = (
  _widget: Widget,
  _callback: () => void,
): void => {};
export const widgetSetOnDoubleClick = (
  _widget: Widget,
  _callback: () => void,
): void => {};
export const widgetSetOnHover = (
  _widget: Widget,
  _callback: (isHovering: boolean) => void,
): void => {};
export const widgetSetOpacity = (
  _widget: Widget,
  _opacity: number,
): void => {};
export const widgetAnimateOpacity = (
  _widget: Widget,
  _target: number,
  _durationSeconds: number,
): void => {};
export const widgetSetBackgroundGradient = (
  _widget: Widget,
  _r1: number,
  _g1: number,
  _b1: number,
  _a1: number,
  _r2: number,
  _g2: number,
  _b2: number,
  _a2: number,
  _angle: number,
): void => {};
export const widgetSetBorderColor = (
  _widget: Widget,
  _r: number,
  _g: number,
  _b: number,
  _a: number,
): void => {};
export const widgetSetBorderWidth = (
  _widget: Widget,
  _width: number,
): void => {};
export const widgetSetShadow = (
  _widget: Widget,
  _r: number,
  _g: number,
  _b: number,
  _a: number,
  _blur: number,
  _offsetX: number,
  _offsetY: number,
): void => {};
export const setCornerRadius = (
  _widget: Widget,
  _radius: number,
): void => {};
export const openFolderDialog = (
  _callback: (path: string) => void,
): void => {};
export const openFileDialog = (
  _callback: (path: string) => void,
): void => {};

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
  titlebarStyle?: "standard" | "overlay";
  body: unknown;
}): void => {
  // Deno/LSP stub only. Real builds are handled by Perry.
};

export const Window = (
  _title: string,
  _width: number,
  _height: number,
): Window => ({
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
export const menuClear = (_menu: Widget): void => {};
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
