import type { PhotoCleanupSettings, PhotoQuad } from "./photo-cleanup.ts";

export type PhotoCleanupWorkerRequest =
  | Readonly<{
    type: "init";
    requestId: number;
    width: number;
    height: number;
    pixels: ArrayBuffer;
  }>
  | Readonly<{
    type: "process";
    requestId: number;
    quad: PhotoQuad;
    output: Readonly<{ width: number; height: number }>;
    settings: PhotoCleanupSettings;
  }>;

export type PhotoCleanupWorkerResponse =
  | Readonly<{ type: "ready"; requestId: number }>
  | Readonly<{
    type: "result";
    requestId: number;
    width: number;
    height: number;
    mask: ArrayBuffer;
    sdf: ArrayBuffer;
  }>
  | Readonly<{ type: "error"; requestId: number; message: string }>;
