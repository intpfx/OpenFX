const sourceHtmlUrl = new URL("../source/index.html", import.meta.url);
const sourceRootUrl = new URL("../source/", import.meta.url);
const shellRootUrl = new URL("../public/hlc/", import.meta.url);
const outputRootUrl = new URL(
  "../../../entry/web/.hlc-public/",
  import.meta.url,
);

export const HLC_DISPLAY_RUNTIME_FILES = Object.freeze([
  "style.css",
  "community-display-runtime.js",
  "community-map.js",
  "community-map-model.js",
  "community-art-model.js",
  "community-world-model.js",
  "community-focus-model.js",
  "community-world-renderer.js",
]);

const HLC_DISPLAY_DATA_FILES = Object.freeze([
  "shengdeng-focus-area.js",
  "yongchang-scene-data.js",
]);

export const HLC_DISPLAY_IMAGE_BUDGET_BYTES = 8 * 1024 * 1024;

export function isHlcDisplayImageFile(filename: string): boolean {
  return filename.startsWith("community-map") && filename.endsWith(".webp");
}

export function assertHlcDisplayImageBudget(imageBytes: number): void {
  if (imageBytes > HLC_DISPLAY_IMAGE_BUDGET_BYTES) {
    throw new Error(
      `HLC display images exceed 8 MiB: ${imageBytes} bytes`,
    );
  }
}

export function createHlcDisplayHtml(source: string): string {
  const withoutAccount = source
    .replace(
      /\n\s*<section id="scene_account_panel"[\s\S]*?<\/section>\n\s*<footer class="scene-account-access">[\s\S]*?<\/footer>/,
      "",
    )
    .replace(/^\s*<link[^>]+(?:icon\.png|icon\.ico)[^>]*>\n/gm, "");

  return withoutAccount
    .replace(
      '<html lang="zh-CN">',
      '<html lang="zh-CN" data-hlc-runtime="display-only">',
    )
    .replace('<base href="${currentOrigin}">', '<base href="/hlc/">')
    .replace(
      '<meta name="start_url" content="/">',
      '<meta name="start_url" content="/hlc/">',
    )
    .replaceAll('href="/icon.svg"', 'href="./icon.svg"')
    .replace('href="/manifest.webmanifest"', 'href="./manifest.webmanifest"')
    .replace(
      'href="style.css"',
      'href="./style.css">\n    <link rel="stylesheet" href="./display.css"',
    )
    .replaceAll(
      /(src|data-src)="\/imgs\/(community-map[^"]*)\.png"/g,
      '$1="/imgs/$2.webp"',
    )
    .replaceAll('src="/imgs/', 'src="./imgs/')
    .replaceAll('srcset="/imgs/', 'srcset="./imgs/')
    .replaceAll('data-src="/imgs/', 'data-src="./imgs/')
    .replaceAll('data-srcset="/imgs/', 'data-srcset="./imgs/')
    .replace(
      /\s*<img src="\.\/imgs\/live_qrcode\.png"[^>]*>/,
      "",
    )
    .replace(
      '</header>\n\n      <section id="scene_viewport"',
      '</header>\n\n      <p class="hlc-display-badge">只读展示 · 登录、注册与数据提交已停用</p>\n\n      <section id="scene_viewport"',
    )
    .replace(
      '<script type="module" src="main.js"></script>',
      '<script type="module" src="./display-entry.js"></script>',
    );
}

async function copyFile(source: URL, destination: URL) {
  await Deno.mkdir(new URL("./", destination), { recursive: true });
  await Deno.copyFile(source, destination);
}

async function copyShellFiles() {
  for await (const entry of Deno.readDir(shellRootUrl)) {
    if (!entry.isFile || entry.name === "index.html") continue;
    await copyFile(
      new URL(entry.name, shellRootUrl),
      new URL(entry.name, outputRootUrl),
    );
  }
}

async function copyRuntimeFiles() {
  for (const filename of HLC_DISPLAY_RUNTIME_FILES) {
    await copyFile(
      new URL(filename, sourceRootUrl),
      new URL(filename, outputRootUrl),
    );
  }

  for (const filename of HLC_DISPLAY_DATA_FILES) {
    await copyFile(
      new URL(`data/${filename}`, sourceRootUrl),
      new URL(`data/${filename}`, outputRootUrl),
    );
  }

  const sourceImagesUrl = new URL("imgs/", sourceRootUrl);
  const displayImages: string[] = [];
  let displayImageBytes = 0;

  for await (const entry of Deno.readDir(sourceImagesUrl)) {
    if (!entry.isFile || !isHlcDisplayImageFile(entry.name)) continue;

    displayImages.push(entry.name);
    displayImageBytes += (await Deno.stat(new URL(entry.name, sourceImagesUrl)))
      .size;
  }

  assertHlcDisplayImageBudget(displayImageBytes);

  for (const filename of displayImages) {
    await copyFile(
      new URL(filename, sourceImagesUrl),
      new URL(`imgs/${filename}`, outputRootUrl),
    );
  }
}

export async function prepareHlcDisplayApp() {
  await Deno.remove(outputRootUrl, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.mkdir(outputRootUrl, { recursive: true });

  const source = await Deno.readTextFile(sourceHtmlUrl);
  await Deno.writeTextFile(
    new URL("index.html", outputRootUrl),
    createHlcDisplayHtml(source),
  );
  await copyShellFiles();
  await copyRuntimeFiles();
}

if (import.meta.main) {
  await prepareHlcDisplayApp();
  console.log("HLC display app prepared at entry/web/.hlc-public");
}
