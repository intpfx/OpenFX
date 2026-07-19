import {
  menuAddItem,
  menuAddStandardAction,
  menuCreate,
  trayAttachMenu,
  trayCreate,
  traySetTooltip,
  type Widget,
} from "perry/ui";

export const TRAY_ICON_PATH = "OpenFXTrayTemplate.png";

export interface NodeTrayActions {
  showWindow(): void;
  sample(): void;
  openConsole(): void;
  quit(): void;
}

export const createNodeTray = (actions: NodeTrayActions): Widget => {
  const tray = trayCreate(TRAY_ICON_PATH);
  traySetTooltip(tray, "OpenFX Node");
  const menu = menuCreate();
  menuAddStandardAction(
    menu,
    "显示 OpenFX Node",
    "perryShowMainWindow:",
    "",
  );
  menuAddItem(menu, "节点状态", actions.showWindow);
  menuAddItem(menu, "立即采样", actions.sample);
  menuAddItem(menu, "打开 OpenFX 控制台", actions.openConsole);
  menuAddItem(menu, "退出", actions.quit);
  trayAttachMenu(tray, menu);
  return tray;
};
