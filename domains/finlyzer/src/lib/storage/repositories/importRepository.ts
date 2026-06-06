import type { ImportJob, ImportSummary, Transaction } from '../../../types/transaction'
import { db } from '../db'
import { applySoftDuplicateLinks } from '../domain/softDuplicateLinking'

export async function saveImportBatch(input: {
  fileNames: string[]
  summary: ImportSummary
  transactions: Transaction[]
}): Promise<{ inserted: number; existing: number; importJob: ImportJob }> {
  const existingTransactions = await db.transactions.toArray()
  const softLinking = applySoftDuplicateLinks(existingTransactions, input.transactions)
  const normalizedTransactions = softLinking.importedRows
  const existingRowMap = new Map<string, Transaction>()
  for (const row of softLinking.existingRows) {
    existingRowMap.set(row.id, row)
  }
  const updatedExistingRows = Array.from(existingRowMap.values())

  const ids = normalizedTransactions.map((item) => item.id)
  const existingRows = await db.transactions.bulkGet(ids)
  const existing = existingRows.filter(Boolean).length

  if (updatedExistingRows.length > 0) {
    await db.transactions.bulkPut(updatedExistingRows)
  }

  if (normalizedTransactions.length > 0) {
    await db.transactions.bulkPut(normalizedTransactions)
  }

  const importJob: ImportJob = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    fileNames: input.fileNames,
    summary: input.summary,
  }

  await db.importJobs.put(importJob)

  return {
    inserted: normalizedTransactions.length - existing,
    existing,
    importJob,
  }
}

export async function getImportJobs(limit = 8): Promise<ImportJob[]> {
  return db.importJobs.orderBy('createdAt').reverse().limit(limit).toArray()
}