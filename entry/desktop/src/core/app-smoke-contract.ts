export const DESKTOP_APP_SMOKE_TOKEN_FLAG = "--openfx-smoke-token";

export interface DesktopAppSmokeRunInput {
  testMode: boolean;
  token: string;
  argv: string[];
  launchMarkerPath: string;
  cleanExitMarkerPath: string;
  pid: number;
  executable: string;
}

export interface DesktopAppSmokeRun {
  token: string;
  pid: number;
  executable: string;
  launchMarkerPath: string;
  cleanExitMarkerPath: string;
}

export type DesktopAppSmokeStatus = "launched" | "clean-exit";

export function deriveDesktopAppSmokeRun(
  input: DesktopAppSmokeRunInput,
): DesktopAppSmokeRun | null {
  if (!input.testMode || !isSmokeToken(input.token)) return null;
  const tokenFlagIndex = input.argv.indexOf(DESKTOP_APP_SMOKE_TOKEN_FLAG);
  if (tokenFlagIndex < 0 || input.argv[tokenFlagIndex + 1] !== input.token) {
    return null;
  }
  if (
    !input.launchMarkerPath.trim() ||
    !input.cleanExitMarkerPath.trim() ||
    !input.executable.trim() ||
    !Number.isInteger(input.pid) ||
    input.pid <= 0
  ) return null;
  return {
    token: input.token,
    pid: input.pid,
    executable: input.executable,
    launchMarkerPath: input.launchMarkerPath,
    cleanExitMarkerPath: input.cleanExitMarkerPath,
  };
}

export function serializeDesktopAppSmokeMarker(
  run: DesktopAppSmokeRun,
  status: DesktopAppSmokeStatus,
): string {
  return JSON.stringify({
    token: run.token,
    pid: run.pid,
    executable: run.executable,
    status,
  });
}

function isSmokeToken(value: string): boolean {
  if (value.length !== 32) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const digit = code >= 48 && code <= 57;
    const lowercaseHex = code >= 97 && code <= 102;
    if (!digit && !lowercaseHex) return false;
  }
  return true;
}
