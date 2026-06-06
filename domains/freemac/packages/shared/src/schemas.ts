import { z } from "zod";

export const loginSchema = z.object({
  password: z.string().min(8),
});

export const agentPromptSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

export const processActionSchema = z.object({
  pid: z.number().int().positive(),
});

export const appActionSchema = z.object({
  appName: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[\w .-]+$/),
});

export const setupInitSchema = z.object({
  password: z.string().min(8).max(200),
});

export const relaySettingsSchema = z.object({
  relayOrigin: z.string().max(500),
});
