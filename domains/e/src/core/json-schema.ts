import type { JsonSchema, KernelError } from "./types.ts";

export interface JsonSchemaValidationResult {
  ok: boolean;
  error?: KernelError;
}

export function validateJsonSchema(
  schema: JsonSchema,
  value: unknown,
): JsonSchemaValidationResult {
  const type = schema.type;
  if (typeof type === "string" && !matchesType(type, value)) {
    return {
      ok: false,
      error: {
        code: "schema_type_mismatch",
        message: `Expected ${type}.`,
      },
    };
  }

  if (type === "object" && Array.isArray(schema.required)) {
    if (!isRecord(value)) {
      return {
        ok: false,
        error: { code: "schema_type_mismatch", message: "Expected object." },
      };
    }

    for (const key of schema.required) {
      if (typeof key === "string" && !(key in value)) {
        return {
          ok: false,
          error: {
            code: "schema_required_missing",
            message: `Missing required property: ${key}.`,
          },
        };
      }
    }
  }

  return { ok: true };
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
    case "null":
      return value === null;
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    default:
      return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
