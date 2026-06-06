import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { AgentToolPlan } from "@freemac/shared";
import { getSystemSnapshot } from "./telemetry.service";
import { logger } from "../lib/logger";

const client = new OpenAI({
  baseURL: process.env.OMLX_BASE_URL || "http://127.0.0.1:8000/v1",
  apiKey: process.env.OMLX_API_KEY || "omlxlocal",
});

const TOOL_MODEL = process.env.OMLX_TOOL_MODEL || "Qwen3.5-4B-MLX-4bit";
const CHAT_MODEL = process.env.OMLX_CHAT_MODEL || "Qwen3.5-0.8B-MLX-4bit";

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "system.getOverview",
      description:
        "Get the current system overview including CPU, memory, disk, network, and process information.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "process.list",
      description: "List the top processes sorted by CPU usage.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "process.kill",
      description: "Kill a process by PID. Requires approval.",
      parameters: {
        type: "object",
        properties: {
          pid: { type: "number", description: "The process ID to kill." },
        },
        required: ["pid"],
      },
    },
  },
];

function buildSystemPrompt(): string {
  const snapshot = getSystemSnapshot();
  return `You are freemac, an AI assistant embedded in a macOS system dashboard.
You can observe and interact with the host machine through tool calls.

Current system state:
- CPU: ${snapshot.cpuUsagePercent}%
- Memory: ${snapshot.memoryUsedMb}/${snapshot.memoryTotalMb} MB (${Math.round((snapshot.memoryUsedMb / snapshot.memoryTotalMb) * 100)}%)
- Disk: ${snapshot.diskUsedGb}/${snapshot.diskTotalGb} GB
- Network: RX ${snapshot.networkRxMb} MB / TX ${snapshot.networkTxMb} MB
- Processes: ${snapshot.processCount} total
- Battery: ${snapshot.batteryPercent !== null ? `${snapshot.batteryPercent}%` : "N/A"}
- Top processes: ${snapshot.topProcesses.map((p) => `${p.command}(${p.pid}) cpu=${p.cpu}%`).join(", ")}

Respond concisely. When a tool call is appropriate, use it. For dangerous operations like killing processes, explain why.`;
}

export function planAgentPrompt(prompt: string): AgentToolPlan {
  if (/kill|terminate/i.test(prompt)) {
    return {
      toolId: "process.kill",
      requiresApproval: true,
      reason: "The request implies a state-changing process action.",
      input: { pid: 0 },
    };
  }

  return {
    toolId: "system.getOverview",
    requiresApproval: false,
    reason: "Defaulting to a read-only overview tool in the scaffold.",
    input: {},
  };
}

export async function chatWithTools(
  messages: ChatCompletionMessageParam[],
): Promise<{ content: string | null; toolCalls: AgentToolPlan[] }> {
  const systemMessage: ChatCompletionMessageParam = {
    role: "system",
    content: buildSystemPrompt(),
  };

  try {
    const response = await client.chat.completions.create({
      model: TOOL_MODEL,
      messages: [systemMessage, ...messages],
      tools,
      stream: false,
    });

    const choice = response.choices[0];
    if (!choice) {
      return { content: "No response from model.", toolCalls: [] };
    }

    const toolCalls: AgentToolPlan[] = (choice.message.tool_calls || [])
      .filter(
        (
          tc,
        ): tc is typeof tc & { type: "function"; function: { name: string; arguments: string } } =>
          tc.type === "function",
      )
      .map((tc) => {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          input = {};
        }

        const requiresApproval = tc.function.name === "process.kill";
        return {
          toolId: tc.function.name,
          requiresApproval,
          reason: requiresApproval
            ? "This operation modifies system state and requires approval."
            : "Read-only operation.",
          input,
        };
      });

    return {
      content: choice.message.content,
      toolCalls,
    };
  } catch (error) {
    logger.error("agent", "OMLX chat request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { content: "Agent service encountered an error.", toolCalls: [] };
  }
}

export async function* streamChat(
  messages: ChatCompletionMessageParam[],
): AsyncGenerator<string, void, unknown> {
  const systemMessage: ChatCompletionMessageParam = {
    role: "system",
    content: buildSystemPrompt(),
  };

  try {
    const stream = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [systemMessage, ...messages],
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  } catch (error) {
    logger.error("agent", "OMLX stream request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    yield "Agent service encountered an error.";
  }
}
