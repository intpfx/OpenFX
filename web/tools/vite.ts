import { build, createServer } from "@voidzero-dev/vite-plus-core";

import config from "../vite.config.ts";

const command = Deno.args[0] ?? "dev";

if (command === "build") {
  await build({ ...config, configFile: false });
} else if (command === "dev") {
  const server = await createServer({ ...config, configFile: false });
  await server.listen();
  server.printUrls();
} else {
  throw new Error(`未知的 VitePlus Core 命令：${command}`);
}
