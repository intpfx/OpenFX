type BuildMetadataEnv = {
  DENO_DEPLOY_BUILD_ID?: string;
  VITE_OPENFX_BUILD_HASH?: string;
  VITE_OPENFX_BUILD_TIME?: string;
};

type BuildMetadataOptions = {
  gitHash?: string | null;
  now?: Date;
};

type BuildMetadata = {
  hash: string;
  time: string;
};

const repoRoot = new URL("../../../", import.meta.url);
const webRoot = new URL("../", import.meta.url);
const textDecoder = new TextDecoder();

function getEnvValue(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function formatBuildTime(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function getFallbackHash(env: BuildMetadataEnv, gitHash?: string | null) {
  const resolvedGitHash = getEnvValue(gitHash);

  if (resolvedGitHash) {
    return resolvedGitHash;
  }

  const deployBuildId = getEnvValue(env.DENO_DEPLOY_BUILD_ID);

  if (deployBuildId) {
    return deployBuildId.slice(0, 7);
  }

  return "unknown";
}

export function createBuildMetadata(
  env: BuildMetadataEnv,
  options: BuildMetadataOptions = {},
): BuildMetadata {
  return {
    hash: getEnvValue(env.VITE_OPENFX_BUILD_HASH) ||
      getFallbackHash(env, options.gitHash),
    time: getEnvValue(env.VITE_OPENFX_BUILD_TIME) ||
      formatBuildTime(options.now ?? new Date()),
  };
}

async function resolveGitShortHash(cwd: URL) {
  try {
    const output = await new Deno.Command("git", {
      args: ["rev-parse", "--short=7", "HEAD"],
      cwd,
      stderr: "null",
      stdout: "piped",
    }).output();

    if (!output.success) {
      return "";
    }

    return textDecoder.decode(output.stdout).trim();
  } catch {
    return "";
  }
}

async function runStep(
  name: string,
  args: string[],
  cwd: URL,
  env: Record<string, string>,
) {
  console.log(`[openfx:web] ${name}`);

  const command = new Deno.Command(Deno.execPath(), {
    args,
    cwd,
    env,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  });
  const status = await command.spawn().status;

  if (!status.success) {
    Deno.exit(status.code);
  }
}

async function main() {
  const env = Deno.env.toObject();
  const gitHash = await resolveGitShortHash(repoRoot);
  const metadata = createBuildMetadata(env, { gitHash });
  const buildEnv = {
    ...env,
    VITE_OPENFX_BUILD_HASH: metadata.hash,
    VITE_OPENFX_BUILD_TIME: metadata.time,
  };

  console.log(`[openfx:web] build metadata ${metadata.time} + ${metadata.hash}`);

  await runStep(
    "client build",
    [
      "run",
      "--config",
      "deno.json",
      "--lock",
      "deno.lock",
      "--frozen",
      "-A",
      "npm:vite-plus@0.1.21/vp",
      "build",
      "--config",
      "entry/web/vite.config.ts",
    ],
    repoRoot,
    buildEnv,
  );

  await runStep(
    "server build",
    [
      "run",
      "--config",
      "deno.json",
      "--lock",
      "../../deno.lock",
      "--frozen",
      "-A",
      "npm:nitropack@2.13.4",
      "build",
    ],
    webRoot,
    {
      ...buildEnv,
      NITRO_PRESET: "deno_deploy",
    },
  );
}

if (import.meta.main) {
  await main();
}
