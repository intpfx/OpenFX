import type { OpenFxNodeErrorCode } from "./constants.ts";

export class OpenFxNodeProtocolError extends Error {
  readonly code: OpenFxNodeErrorCode;

  constructor(code: OpenFxNodeErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "OpenFxNodeProtocolError";
    this.code = code;
  }
}
