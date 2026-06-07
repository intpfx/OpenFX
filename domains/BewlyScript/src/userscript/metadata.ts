import { version } from "../../package.json";

export const USERSCRIPT_NAME = "BewlyScript";
export const USERSCRIPT_NAMESPACE = "https://github.com/intpfx/OpenFX/tree/main/domains/BewlyScript";

export const USERSCRIPT_MATCHES = [
  "https://www.bilibili.com/*",
  "https://m.bilibili.com/*",
  "https://search.bilibili.com/*",
  "https://space.bilibili.com/*",
  "https://t.bilibili.com/*",
  "https://message.bilibili.com/*",
  "https://member.bilibili.com/*",
  "https://account.bilibili.com/*",
  "https://passport.bilibili.com/*",
  "https://music.bilibili.com/*",
  "https://www.hdslb.com/*",
] as const;

export const USERSCRIPT_GRANTS = [
  "GM.getValue",
  "GM.setValue",
  "GM.deleteValue",
  "GM.listValues",
  "GM.openInTab",
  "GM.xmlHttpRequest",
  "GM_xmlhttpRequest",
] as const;

export const USERSCRIPT_CONNECTS = [
  "bilibili.com",
  "*.bilibili.com",
  "*.hdslb.com",
  "api.bilibili.com",
  "app.bilibili.com",
  "passport.bilibili.com",
] as const;

export function getUserscriptVersion(baseVersion = version): string {
  return `${baseVersion}-userscript.0`;
}

export function buildUserscriptMetadata(baseVersion = version): string {
  const lines = [
    "// ==UserScript==",
    `// @name         ${USERSCRIPT_NAME}`,
    `// @namespace    ${USERSCRIPT_NAMESPACE}`,
    `// @version      ${getUserscriptVersion(baseVersion)}`,
    "// @description  BewlyScript enhances Bilibili web, packaged for Userscripts and Tampermonkey.",
    "// @author       BewlyScript contributors",
    ...USERSCRIPT_MATCHES.map(match => `// @match        ${match}`),
    "// @run-at       document-start",
    "// @inject-into  content",
    ...USERSCRIPT_GRANTS.map(grant => `// @grant        ${grant}`),
    ...USERSCRIPT_CONNECTS.map(connect => `// @connect      ${connect}`),
    "// ==/UserScript==",
  ];

  return lines.join("\n");
}
