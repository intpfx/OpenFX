import Dexie, { type EntityTable } from 'dexie'
import type { CategoryNode, ImportJob, Transaction } from '../../types/transaction'

export type AppMeta = {
  key: string
  value: string
}

export type CategoryTreeRecord = {
  id: string
  tree: CategoryNode[]
}

const DB_NAME = 'finlyzer-db'
const DB_VERSION = 6

export class FinlyzerDb extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  importJobs!: EntityTable<ImportJob, 'id'>
  categoryTrees!: EntityTable<CategoryTreeRecord, 'id'>
  appMeta!: EntityTable<AppMeta, 'key'>

  constructor() {
    super(DB_NAME)
    this.version(DB_VERSION).stores({
      transactions: 'id, fingerprint, timestamp, monthKey, source, primaryCategory, direction',
      importJobs: 'id, createdAt',
      categoryTrees: 'id',
      appMeta: 'key',
    })
  }
}

export const db = new FinlyzerDb()
export const SCHEMA_VERSION = DB_VERSION
