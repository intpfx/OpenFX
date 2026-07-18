import { assert, assertEquals } from "@std/assert";

const MAIN_URL = new URL("../src/main.ts", import.meta.url);
const SRC_URL = new URL("../src/", import.meta.url);

Deno.test("desktop entry is an accessory tray app with the required native boundaries", async () => {
  const source = await readTypeScriptTree(SRC_URL);
  const main = await Deno.readTextFile(MAIN_URL);

  assert(main.includes('appSetActivationPolicy("accessory")'));
  assert(main.includes("trayCreate("));
  assert(main.includes('"perryShowMainWindow:"'));
  assertEquals(main.includes("Window("), false);
  assert(source.includes('from "node:http"'));
  assert(source.includes('from "node:https"'));
  assert(source.includes('from "node:crypto"'));
  assert(source.includes('from "node:child_process"'));
  assert(!source.includes("fetch("));
  assert(source.includes('hostname: "127.0.0.1"'));
  assert(source.includes('KEYCHAIN_SERVICE = "OpenFX Node"'));
});

Deno.test("desktop entry exposes the exact closed v1 Agent tool set", async () => {
  const source = await readTypeScriptTree(SRC_URL);
  const expected = [
    "system.getOverview",
    "process.list",
    "network.getStatus",
    "relay.getStatus",
    "audit.list",
    "process.kill",
    "app.open",
    "relay.update",
  ];

  for (const id of expected) assert(source.includes(`\"${id}\"`));
  assertEquals(source.includes("shell.exec"), false);
  assertEquals(source.includes("file.read"), false);
  assertEquals(source.includes("url.open"), false);
});

async function readTypeScriptTree(directory: URL): Promise<string> {
  const sources: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), directory);
    if (entry.isDirectory) {
      sources.push(await readTypeScriptTree(url));
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      sources.push(await Deno.readTextFile(url));
    }
  }
  return sources.join("\n");
}
