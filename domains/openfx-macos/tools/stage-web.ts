const domainRoot = new URL("../", import.meta.url);
const sourceRoot = new URL("../../web/.output/public/", domainRoot);
const targetRoot = new URL(".openfx-web/", domainRoot);

async function exists(url: URL): Promise<boolean> {
  try {
    await Deno.stat(url);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function copyDirectory(source: URL, target: URL): Promise<void> {
  await Deno.mkdir(target, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    if (entry.name === ".DS_Store") continue;
    const sourceEntry = new URL(
      entry.name + (entry.isDirectory ? "/" : ""),
      source,
    );
    const targetEntry = new URL(
      entry.name + (entry.isDirectory ? "/" : ""),
      target,
    );
    if (entry.isDirectory) {
      await copyDirectory(sourceEntry, targetEntry);
    } else if (entry.isFile) {
      await Deno.copyFile(sourceEntry, targetEntry);
    }
  }
}

if (!(await exists(sourceRoot))) {
  throw new Error("缺少 web/.output/public；请先完成 Web 构建");
}

if (await exists(targetRoot)) {
  await Deno.remove(targetRoot, { recursive: true });
}
await copyDirectory(sourceRoot, targetRoot);
console.log(`已暂存 macOS Web 资源：${targetRoot.pathname}`);
