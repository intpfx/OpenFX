import { join } from "jsr:@std/path@^1.1.4";

export const LOCAL_ADMIN_KEY = "TEST";
export const LOCAL_WEB_LOCATION = "https://127.0.0.1:34431";

export function createLocalWebEnvironment(
  inherited: Record<string, string>,
  runtimeDirectory: string,
  credentialKey: string,
): Record<string, string> {
  const environment = { ...inherited };
  delete environment.OPENFX_ADMIN_KEY;
  delete environment.DENO_DEPLOYMENT_ID;
  if (environment.NODE_ENV?.trim().toLowerCase() === "production") {
    delete environment.NODE_ENV;
  }
  environment.DENO_DIR = join(runtimeDirectory, "deno-dir");
  environment.OPENFX_NODE_CREDENTIAL_KEY = credentialKey;
  return environment;
}
