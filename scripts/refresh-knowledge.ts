const decoder = new TextDecoder();

interface SourceEntry {
  name: string;
  url: string;
  kind: string;
}

const sourcesPath = new URL("../knowledge/sources.json", import.meta.url);
const outputPath = new URL("../knowledge/index.generated.md", import.meta.url);

const sources = JSON.parse(
  decoder.decode(await Deno.readFile(sourcesPath)),
) as SourceEntry[];

const getTitle = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "openfx-knowledge-refresh/0.1.0" },
    });

    const text = await response.text();
    const match = text.match(/<title>(.*?)<\/title>/is);

    return match?.[1]?.trim() ?? "title unavailable";
  } catch {
    return "unreachable during refresh";
  }
};

const refreshedAt = new Date().toISOString();
const sections = await Promise.all(
  sources.map(async (source) => {
    const title = await getTitle(source.url);
    return `- **${source.name}** (${source.kind})\n  - URL: ${source.url}\n  - Observed title: ${title}`;
  }),
);

const content = [
  "# OpenFX Knowledge Index",
  "",
  "_This file is generated from `knowledge/sources.json`. Refresh with `deno task knowledge:refresh`._",
  "",
  `Last refreshed: ${refreshedAt}`,
  "",
  "## Sources",
  "",
  ...sections,
  "",
].join("\n");

await Deno.writeTextFile(outputPath, content);
