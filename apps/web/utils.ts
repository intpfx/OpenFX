import { createDefine } from "fresh";

export interface OpenFxState {
  requestId?: string;
}

export const define = createDefine<OpenFxState>();
