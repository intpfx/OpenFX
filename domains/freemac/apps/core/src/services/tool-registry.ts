export interface ToolDefinition {
  id: string;
  description: string;
  requiresApproval: boolean;
  readonly: boolean;
}

export const toolRegistry: ToolDefinition[] = [
  {
    id: "system.getOverview",
    description: "Read the current system overview",
    requiresApproval: false,
    readonly: true,
  },
  {
    id: "process.list",
    description: "List running processes",
    requiresApproval: false,
    readonly: true,
  },
  {
    id: "process.kill",
    description: "Terminate a process by pid",
    requiresApproval: true,
    readonly: false,
  },
  {
    id: "app.open",
    description: "Open a whitelisted application",
    requiresApproval: false,
    readonly: false,
  },
];
