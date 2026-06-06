import { createSessionRecord, deleteSessionRecord, hasActiveSessionRecord } from "../db/client";
import { config } from "../config";
import { nanoid } from "nanoid";
import { getPasswordHash } from "./settings.service";

export async function verifyPassword(password: string): Promise<boolean> {
  const passwordHash = getPasswordHash();
  if (passwordHash) {
    return Bun.password.verify(password, passwordHash);
  }

  return password === config.sessionPassword;
}

export function createSession(): string {
  const id = nanoid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  createSessionRecord({
    id,
    createdAt: now.toISOString(),
    expiresAt,
  });
  return id;
}

export function hasSession(id: string | undefined): boolean {
  if (!id) {
    return false;
  }
  return hasActiveSessionRecord(id, new Date().toISOString());
}

export function destroySession(id: string | undefined): void {
  if (!id) {
    return;
  }
  deleteSessionRecord(id);
}
