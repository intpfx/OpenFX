import type { ImportSummary, ParsedFileResult, Transaction } from '../../types/transaction'
import * as XLSX from 'xlsx'
import { parseAlipay } from './alipayParser'
import { parseBank } from './bankParser'
import { decodeFileBuffer } from './common'
import { detectSourceFromText } from './detectSource'
import { parseWeChat } from './wechatParser'

function isExcelFile(fileName: string): boolean {
  return /\.(xlsx|xls)$/i.test(fileName)
}

async function fileToText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()

  if (isExcelFile(file.name)) {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheet = workbook.SheetNames[0]
    if (!firstSheet) {
      throw new Error('Excel 文件中未找到工作表')
    }
    const worksheet = workbook.Sheets[firstSheet]
    return XLSX.utils.sheet_to_csv(worksheet)
  }

  return decodeFileBuffer(buffer)
}

function parseBySource(source: ParsedFileResult['source'], content: string): ParsedFileResult {
  if (source === 'alipay') {
    return parseAlipay(content)
  }
  if (source === 'bank') {
    return parseBank(content)
  }
  return parseWeChat(content)
}

export type PipelineResult = {
  transactions: Transaction[]
  summary: ImportSummary
}

export async function importFiles(files: File[]): Promise<PipelineResult> {
  const allFailures: ImportSummary['failures'] = []
  const allTransactions: Transaction[] = []
  const sources = new Set<ParsedFileResult['source']>()
  let totalRows = 0
  let validRows = 0
  let failedRows = 0

  for (const file of files) {
    try {
      const content = await fileToText(file)
      const source = detectSourceFromText(content)
      if (!source) {
        failedRows += 1
        allFailures.push({
          fileName: file.name,
          rowNumber: 0,
          reason: '无法识别账单来源',
          raw: '',
        })
        continue
      }

      const parsed = parseBySource(source, content)
      sources.add(parsed.source)
      totalRows += parsed.transactions.length + parsed.failures.length
      validRows += parsed.transactions.length
      failedRows += parsed.failures.length
      allFailures.push(
        ...parsed.failures.map((item) => ({
          fileName: file.name,
          rowNumber: item.rowNumber,
          reason: item.reason,
          raw: item.raw,
        })),
      )
      allTransactions.push(...parsed.transactions)
    } catch (error) {
      failedRows += 1
      const message = error instanceof Error ? error.message : '未知错误'
      allFailures.push({
        fileName: file.name,
        rowNumber: 0,
        reason: message,
        raw: '',
      })
    }
  }

  const deduped = new Map<string, Transaction>()
  for (const item of allTransactions) {
    if (!deduped.has(item.fingerprint)) {
      deduped.set(item.fingerprint, item)
    }
  }

  const transactions = Array.from(deduped.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const summary: ImportSummary = {
    totalRows,
    validRows,
    duplicateRows: allTransactions.length - transactions.length,
    failedRows,
    failures: allFailures,
    sources: Array.from(sources),
  }

  return { transactions, summary }
}
