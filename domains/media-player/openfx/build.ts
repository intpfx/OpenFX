const domainRoot = new URL('../', import.meta.url);
const openFxPublic = new URL('../.openfx-public/', import.meta.url);
const pnpmVersion = '9.15.9';
const pnpmMaxOldSpaceMb = 2048;

export function shouldReusePreparedMediaPlayerAssets(
  env: Readonly<Record<string, string | undefined>>,
  hasPreparedAssets: boolean,
) {
  return env.DENO_DEPLOY === 'true' && hasPreparedAssets;
}

async function hasPreparedMediaPlayerAssets() {
  try {
    return (await Deno.stat(new URL('index.html', openFxPublic))).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function runPnpm(args: string[], env: Record<string, string> = {}) {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      `--v8-flags=--max-old-space-size=${pnpmMaxOldSpaceMb}`,
      '--no-config',
      '-A',
      `npm:pnpm@${pnpmVersion}`,
      ...args,
    ],
    cwd: domainRoot,
    env: {
      ...Deno.env.toObject(),
      ...env,
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const status = await command.spawn().status;
  if (!status.success) {
    throw new Error(`media-player command failed: pnpm ${args.join(' ')}`);
  }
}

export async function prepareMediaPlayerAssets() {
  if (
    shouldReusePreparedMediaPlayerAssets(
      Deno.env.toObject(),
      await hasPreparedMediaPlayerAssets(),
    )
  ) {
    console.log('[openfx:media-player] reuse verified publication snapshot');
    return;
  }

  console.log(`[openfx:media-player] install with pnpm ${pnpmVersion}`);
  await runPnpm([
    'install',
    '--frozen-lockfile',
    '--prefer-offline',
    '--network-concurrency=8',
    '--child-concurrency=2',
  ]);

  console.log('[openfx:media-player] build minimal player');
  await runPnpm(['run', 'build'], {
    OPENFX_MEDIA_PLAYER_BASE: '/media-player/',
  });

  try {
    await Deno.remove(openFxPublic, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  await Deno.rename(new URL('../dist/', import.meta.url), openFxPublic);
  console.log('[openfx:media-player] staged .openfx-public');
}

if (import.meta.main) {
  await prepareMediaPlayerAssets();
}
