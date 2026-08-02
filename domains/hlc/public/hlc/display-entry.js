import { installHlcDisplayRuntime } from "./community-display-runtime.js";

installHlcDisplayRuntime();
globalThis.hlcLegacyContentReady = true;
await import("./community-map.js");
