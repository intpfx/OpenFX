import type { BoundaryRequest, QueuedMessage, TurnRecord } from "../core/types.ts";

export type ProgressEventType =
  | "foreground:started"
  | "foreground:user_message"
  | "runtime:queued"
  | "runtime:step_started"
  | "runtime:step_completed"
  | "runtime:idle"
  | "runtime:interrupted"
  | "boundary:required"
  | "boundary:approved"
  | "boundary:rejected";

export interface ProgressEvent {
  id: string;
  type: ProgressEventType;
  at: number;
  payload?: {
    message?: string;
    queuedMessage?: QueuedMessage;
    turnRecord?: TurnRecord;
    boundaryRequest?: BoundaryRequest;
    reason?: string;
  };
}

export interface ForegroundControlSignal {
  kind: "interrupt" | "approve" | "reject" | "pause" | "resume";
  reason?: string;
  boundaryRequestId?: string;
}
