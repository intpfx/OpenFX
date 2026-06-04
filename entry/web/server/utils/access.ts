import {
  getUnlockRule,
  isAdminUnlockKey,
  isUnlockRuleExpired,
} from "../admin/unlocks.ts";
import { DOMAIN_CONTENT_PUBLIC } from "../../domain-access.ts";

export type ProjectAccessResult =
  | { ok: true; mode: "public" | "admin" | "unlock" }
  | { ok: false; error: "unauthorized" | "expired_key" | "project_not_allowed" };

export type ProjectAccessOptions = {
  public?: boolean;
};

const getBearerToken = (value: string): string => {
  const trimmed = value.trim();
  const prefix = "bearer ";
  return trimmed.toLowerCase().startsWith(prefix)
    ? trimmed.slice(prefix.length).trim()
    : "";
};

export const getProjectAccessKey = (req: Request): string => {
  const url = new URL(req.url);
  const explicitHeader = req.headers.get("x-openfx-unlock-key")?.trim();
  if (explicitHeader) return explicitHeader;

  const adminHeader = req.headers.get("x-openfx-admin-key")?.trim();
  if (adminHeader) return adminHeader;

  const bearer = getBearerToken(req.headers.get("authorization") ?? "");
  if (bearer) return bearer;

  return (url.searchParams.get("unlock_key") ?? url.searchParams.get("key") ?? "")
    .trim();
};

export const checkProjectAccess = async (
  req: Request,
  projectId: string,
  options: ProjectAccessOptions = {},
): Promise<ProjectAccessResult> => {
  if (options.public ?? DOMAIN_CONTENT_PUBLIC) {
    return { ok: true, mode: "public" };
  }

  const key = getProjectAccessKey(req);
  if (!key) {
    return { ok: false, error: "unauthorized" };
  }

  if (isAdminUnlockKey(key)) {
    return { ok: true, mode: "admin" };
  }

  const rule = await getUnlockRule(key);
  if (!rule) {
    return { ok: false, error: "unauthorized" };
  }

  if (isUnlockRuleExpired(rule)) {
    return { ok: false, error: "expired_key" };
  }

  if (!rule.projectIds.includes(projectId)) {
    return { ok: false, error: "project_not_allowed" };
  }

  return { ok: true, mode: "unlock" };
};

export const projectAccessDeniedResponse = (
  result: Exclude<ProjectAccessResult, { ok: true }>,
): Response => {
  const status = result.error === "unauthorized" ? 401 : 403;
  return Response.json({ ok: false, error: result.error }, { status });
};

export const requireProjectAccess = async (
  req: Request,
  projectId: string,
  options?: ProjectAccessOptions,
): Promise<Response | null> => {
  const result = await checkProjectAccess(req, projectId, options);
  return result.ok ? null : projectAccessDeniedResponse(result);
};
