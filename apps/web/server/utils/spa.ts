import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const indexCandidates = [
  join(process.cwd(), "public", "index.html"),
  join(process.cwd(), ".client-dist", "index.html"),
  join(process.cwd(), "apps", "web", ".client-dist", "index.html"),
];

let cachedHtml: string | null = null;

const loadIndexHtml = async (): Promise<string> => {
  if (cachedHtml !== null) {
    return cachedHtml;
  }

  for (const candidate of indexCandidates) {
    try {
      cachedHtml = await readFile(candidate, "utf8");
      return cachedHtml;
    } catch {
      // try next candidate
    }
  }

  throw new Error("Unable to locate built client index.html");
};

export const renderSpaDocument = async (): Promise<Response> => {
  const html = await loadIndexHtml();
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
};
