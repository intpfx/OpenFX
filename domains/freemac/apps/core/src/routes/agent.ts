import { Elysia, t } from "elysia";
import { planAgentPrompt } from "../services/agent.service";
import { executeTool } from "../services/executor.service";

export const agentRoutes = new Elysia({ prefix: "/agent" })
  .post(
    "/plan",
    ({ body }) => ({
      ok: true,
      plan: planAgentPrompt(body.prompt),
    }),
    {
      body: t.Object({
        prompt: t.String({ minLength: 1 }),
      }),
    },
  )
  .post(
    "/execute",
    async ({ body }) => ({
      ok: true,
      result: await executeTool(body.toolId, body.input),
    }),
    {
      body: t.Object({
        toolId: t.String(),
        input: t.Record(t.String(), t.Unknown()),
      }),
    },
  );
