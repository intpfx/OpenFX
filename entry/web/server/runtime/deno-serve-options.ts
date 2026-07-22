export type DenoServeOptions = Readonly<{
  hostname?: string;
}>;

export function createDenoServeOptions(
  localRuntime: string | undefined,
): DenoServeOptions {
  return localRuntime?.trim() ? { hostname: "127.0.0.1" } : {};
}
