const rootUrl = new URL("../", import.meta.url);

const configFiles = [
  "deno.json",
  "entry/web/deno.json",
  ".github/workflows/ci.yml",
];

async function readText(relativePath: string) {
  return await Deno.readTextFile(new URL(relativePath, rootUrl));
}

async function pathExists(relativePath: string) {
  try {
    await Deno.stat(new URL(relativePath, rootUrl));
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }

    throw error;
  }
}

const failures: string[] = [];

if (await pathExists("pnpm-lock.yaml")) {
  failures.push("pnpm-lock.yaml must not exist in the repository.");
}

if (await pathExists("package.json")) {
  failures.push(
    "Root package.json must not exist; use deno.json as the source of truth.",
  );
}

if (await pathExists("package-lock.json")) {
  failures.push(
    "Root package-lock.json must not exist; use deno.lock as the only root lockfile.",
  );
}

for (const relativePath of configFiles) {
  const content = await readText(relativePath);
  if (/\bpnpm\b/.test(content)) {
    failures.push(`${relativePath} must not reference pnpm.`);
  }
}

if (failures.length > 0) {
  console.error("Deno-only guard failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  Deno.exit(1);
}

console.log("Deno-only guard passed.");
