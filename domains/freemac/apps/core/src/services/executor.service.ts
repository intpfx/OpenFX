import { appendAuditLog } from "../db/client";
import { nanoid } from "nanoid";

export interface ExecutionResult {
  ok: boolean;
  summary: string;
}

export async function executeTool(
  toolId: string,
  input: Record<string, unknown>,
): Promise<ExecutionResult> {
  appendAuditLog({
    id: nanoid(),
    category: "tool",
    action: toolId,
    status: "accepted",
    payload: JSON.stringify(input),
    createdAt: new Date().toISOString(),
  });

  return {
    ok: true,
    summary: `Tool ${toolId} accepted by executor scaffold.`,
  };
}
