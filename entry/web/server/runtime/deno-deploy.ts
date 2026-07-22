import "#nitro-internal-pollyfills";
import wsAdapter from "crossws/adapters/deno";
import { useNitroApp } from "nitropack/runtime";

import { createDenoRequestHandler } from "./deno-request.ts";
import { createDenoServeOptions } from "./deno-serve-options.ts";

declare global {
  interface ImportMeta {
    _websocket?: boolean;
  }
}

const nitroApp = useNitroApp();
const websocket = import.meta._websocket
  ? wsAdapter(nitroApp.h3App.websocket)
  : undefined;

Deno.serve(
  createDenoServeOptions(Deno.env.get("OPENFX_LOCAL_RUNTIME")),
  createDenoRequestHandler({
    localFetch: (path, init) => nitroApp.localFetch(path, init),
    websocket,
  }),
);
