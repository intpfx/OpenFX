import { db } from '../db'

export async function getAppMetaValue(key: string): Promise<string | null> {
  const record = await db.appMeta.get(key)
  return record?.value ?? null
}

export async function setAppMetaValue(key: string, value: string): Promise<void> {
  await db.appMeta.put({ key, value })
}