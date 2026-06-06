export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCommand(cmd: string[], timeoutMs = 5000): Promise<CommandResult> {
  const process = Bun.spawn({
    cmd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timer = setTimeout(() => {
    process.kill();
  }, timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);

    return { stdout, stderr, exitCode };
  } finally {
    clearTimeout(timer);
  }
}
