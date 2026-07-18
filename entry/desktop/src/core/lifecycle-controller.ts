export interface DesktopLifecycleServices {
  startServices(): Promise<void>;
  stopServices(): Promise<void>;
}

export interface DesktopLifecycleSnapshot {
  services: "stopped" | "starting" | "running" | "stopping";
  mainWindow: "visible" | "hidden";
}

export interface DesktopLifecycleController {
  start(): Promise<void>;
  terminate(): Promise<void>;
  mainWindowClosed(): void;
  mainWindowShown(): void;
  snapshot(): DesktopLifecycleSnapshot;
}

export const createDesktopLifecycleController = (
  services: DesktopLifecycleServices,
): DesktopLifecycleController => {
  let state: DesktopLifecycleSnapshot = {
    services: "stopped",
    mainWindow: "hidden",
  };
  let startPromise: Promise<void> | null = null;

  return {
    async start() {
      if (state.services === "running") return;
      if (startPromise) return await startPromise;
      state = { ...state, services: "starting" };
      startPromise = services.startServices().then(() => {
        state = { ...state, services: "running" };
      }).catch((error) => {
        state = { ...state, services: "stopped" };
        throw error;
      }).finally(() => {
        startPromise = null;
      });
      await startPromise;
    },
    async terminate() {
      if (startPromise) await startPromise;
      if (state.services === "stopped") return;
      state = { ...state, services: "stopping" };
      await services.stopServices();
      state = { ...state, services: "stopped" };
    },
    mainWindowClosed() {
      state = { ...state, mainWindow: "hidden" };
    },
    mainWindowShown() {
      state = { ...state, mainWindow: "visible" };
    },
    snapshot: () => ({ ...state }),
  };
};
