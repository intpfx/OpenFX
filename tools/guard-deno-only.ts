const rootUrl = new URL("../", import.meta.url);

const allowedPackageJsonKeys = new Set([
  "name",
  "private",
  "version",
  "description",
  "license",
  "type",
]);

const configFiles = [
  "deno.json",
  "entry/web/deno.json",
  ".github/workflows/ci.yml",
];

async function readText(relativePath: string) {
  return await Deno.readTextFile(new URL(relativePath, rootUrl));
}

async function readJson(relativePath: string) {
  return JSON.parse(await readText(relativePath)) as Record<string, unknown>;
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

const packageJson = await readJson("package.json");
const extraPackageJsonKeys = Object.keys(packageJson).filter((key) =>
  !allowedPackageJsonKeys.has(key)
);

if (extraPackageJsonKeys.length > 0) {
  failures.push(
    `package.json must stay metadata-only. Unexpected keys: ${
      extraPackageJsonKeys.join(", ")
    }`,
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
