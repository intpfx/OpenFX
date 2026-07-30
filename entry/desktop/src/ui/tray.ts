import {
  menuAddItem,
  menuAddSeparator,
  menuAddStandardAction,
  menuClear,
  menuCreate,
  trayAttachMenu,
  trayCreate,
  traySetTooltip,
  type Widget,
} from "perry/ui";

export interface NodeTrayActions {
  sample(): void;
  openSettings(): void;
  openConsole(): void;
  quit(): void;
}

export interface NodeTrayPresentation {
  nodeName: string;
  connectionStatus: string;
  serviceStatus: string;
  networkStatus: string;
  relayStatus: string;
  agentStatus: string;
  lastReportStatus: string;
}

export interface NodeTrayController {
  tray: Widget;
  update(presentation: NodeTrayPresentation): void;
}

export const createNodeTray = (
  initial: NodeTrayPresentation,
  actions: NodeTrayActions,
): NodeTrayController => {
  const tray = trayCreate("");
  const menu = menuCreate();
  trayAttachMenu(tray, menu);

  const update = (presentation: NodeTrayPresentation): void => {
    traySetTooltip(
      tray,
      `${presentation.nodeName} · ${presentation.connectionStatus}`,
    );
    menuClear(menu);
    menuAddItem(
      menu,
      `● ${presentation.nodeName} · ${presentation.connectionStatus}`,
      () => {},
    );
    menuAddItem(menu, `服务 ${presentation.serviceStatus}`, () => {});
    menuAddItem(
      menu,
      `Relay ${presentation.relayStatus} · Agent ${presentation.agentStatus}`,
      () => {},
    );
    menuAddItem(menu, `网络 ${presentation.networkStatus}`, () => {});
    menuAddItem(menu, `上次上报 ${presentation.lastReportStatus}`, () => {});
    menuAddSeparator(menu);
    menuAddStandardAction(
      menu,
      "显示文件管理器",
      "perryShowMainWindow:",
      "",
    );
    menuAddItem(menu, "节点配对与设置…", actions.openSettings);
    menuAddItem(menu, "立即采样", actions.sample);
    menuAddItem(menu, "打开 Web 控制台", actions.openConsole);
    menuAddSeparator(menu);
    menuAddItem(menu, "退出", actions.quit);
  };
  update(initial);
  return { tray, update };
};
