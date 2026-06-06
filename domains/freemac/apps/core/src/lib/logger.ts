type LogLevel = "info" | "warn" | "error" | "debug";

function write(level: LogLevel, scope: string, message: string, meta?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (meta === undefined) {
    console.log(line);
    return;
  }
  console.log(line, meta);
}

export const logger = {
  info: (scope: string, message: string, meta?: unknown) => write("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => write("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: unknown) => write("error", scope, message, meta),
  debug: (scope: string, message: string, meta?: unknown) => write("debug", scope, message, meta),
};
