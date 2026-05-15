export type RuntimeSurface = "desktop" | "web";

export interface RuntimeHealth {
  readonly name: "OpenFX";
  readonly surface: RuntimeSurface;
  readonly status: "ok";
  readonly version: string;
}

export const createRuntimeHealth = (
  input: { readonly surface: RuntimeSurface; readonly version: string },
): RuntimeHealth => ({
  name: "OpenFX",
  surface: input.surface,
  status: "ok",
  version: input.version,
});
