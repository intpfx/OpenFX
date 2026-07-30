import {
  VStack,
  type Widget,
  widgetSetBackgroundColor,
  widgetSetEdgeInsets,
  widgetSetHeight,
  widgetSetWidth,
  Window,
  type Window as PerryWindow,
} from "perry/ui";

export interface NodeSettingsWindowController {
  show(): void;
}

export function createNodeSettingsWindow(
  settingsBody: Widget,
): NodeSettingsWindowController {
  const root = VStack(0, [settingsBody]);
  widgetSetWidth(root, 540);
  widgetSetHeight(root, 620);
  widgetSetEdgeInsets(root, 24, 24, 24, 24);
  widgetSetBackgroundColor(root, 0.035, 0.04, 0.045, 1);

  let settingsWindow: PerryWindow | null = null;
  return {
    show() {
      if (!settingsWindow) {
        settingsWindow = Window("OpenFX Node 设置", 540, 620);
        settingsWindow.setBody(root);
      }
      settingsWindow.show();
    },
  };
}
