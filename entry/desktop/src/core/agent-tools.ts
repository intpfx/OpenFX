export interface AgentToolDefinition {
  id: string;
  description: string;
  requiresApproval: boolean;
  readonly: boolean;
  inputSchema: Record<string, unknown>;
}

const noInput = { type: "object", properties: {}, additionalProperties: false };

export const AGENT_TOOLS: readonly AgentToolDefinition[] = Object.freeze([
  {
    id: "system.getOverview",
    description: "Read the current macOS system overview.",
    requiresApproval: false,
    readonly: true,
    inputSchema: noInput,
  },
  {
    id: "process.list",
    description: "List running processes.",
    requiresApproval: false,
    readonly: true,
    inputSchema: noInput,
  },
  {
    id: "network.getStatus",
    description: "Read the current public IPv6 status.",
    requiresApproval: false,
    readonly: true,
    inputSchema: noInput,
  },
  {
    id: "relay.getStatus",
    description: "Read OpenFX relay status.",
    requiresApproval: false,
    readonly: true,
    inputSchema: noInput,
  },
  {
    id: "audit.list",
    description: "List append-only local audit events.",
    requiresApproval: false,
    readonly: true,
    inputSchema: noInput,
  },
  {
    id: "process.kill",
    description: "Terminate one process by numeric pid.",
    requiresApproval: true,
    readonly: false,
    inputSchema: {
      type: "object",
      properties: { pid: { type: "integer", minimum: 1 } },
      required: ["pid"],
      additionalProperties: false,
    },
  },
  {
    id: "app.open",
    description: "Open one application from the configured allowlist.",
    requiresApproval: true,
    readonly: false,
    inputSchema: {
      type: "object",
      properties: { application: { type: "string" } },
      required: ["application"],
      additionalProperties: false,
    },
  },
  {
    id: "relay.update",
    description: "Enable or disable OpenFX relay reporting.",
    requiresApproval: true,
    readonly: false,
    inputSchema: {
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
      additionalProperties: false,
    },
  },
]);

export const findAgentTool = (id: string): AgentToolDefinition | null =>
  AGENT_TOOLS.find((tool) => tool.id === id) ?? null;
