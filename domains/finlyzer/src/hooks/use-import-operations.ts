import { useCallback, useRef, useState } from 'react'
import type { ImportSummary } from '@/types/transaction'
import { importFiles } from '@/lib/parsers/importPipeline'
import { downloadBackup, exportBackup, restoreBackup } from '@/lib/storage/backup'
import { saveImportBatch } from '@/lib/storage/repositories'

export type ImportState = 'idle' | 'detecting' | 'parsing' | 'persisting' | 'success' | 'partial' | 'error'

export function useImportOperations({
  refreshData,
  setImportNote,
}: {
  refreshData: () => Promise<void>
  setImportNote: (message: string) => void
}) {
  const [importState, setImportState] = useState<ImportState>('idle')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const restoreInputRef = useRef<HTMLInputElement | null>(null)

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const handleFileSelection = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (files.length === 0) return

    try {
      setImportState('detecting')
      setImportNote('正在自动识别账单来源...')
      const pipeline = await importFiles(files)

      setImportState('parsing')
      setImportNote('已识别来源，正在归一化和去重...')

      setImportState('persisting')
      setImportNote('正在写入本地数据库...')
      const saveResult = await saveImportBatch({
        fileNames: files.map((file) => file.name),
        summary: pipeline.summary,
        transactions: pipeline.transactions,
      })

      setImportSummary({
        ...pipeline.summary,
        duplicateRows: pipeline.summary.duplicateRows + saveResult.existing,
      })
      setImportState(pipeline.summary.failedRows > 0 ? 'partial' : 'success')
      setImportNote(
        `导入完成: 新增 ${saveResult.inserted} 条，已存在 ${saveResult.existing} 条，失败 ${pipeline.summary.failedRows} 条。`,
      )
      await refreshData()
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入失败'
      setImportState('error')
      setImportNote(message)
    }
  }, [refreshData, setImportNote])

  const handleExportBackup = useCallback(async () => {
    const payload = await exportBackup()
    downloadBackup(payload)
    setImportNote(`备份已导出（${payload.transactions.length} 条流水）`)
  }, [setImportNote])

  const handleRestoreClick = useCallback(() => {
    restoreInputRef.current?.click()
  }, [])

  const handleRestoreSelection = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      await restoreBackup(file)
      await refreshData()
      setImportNote('恢复完成，已重新加载本地数据。')
    } catch (error) {
      const message = error instanceof Error ? error.message : '恢复失败'
      setImportNote(message)
    }
  }, [refreshData, setImportNote])

  return {
    importState,
    importSummary,
    importInputRef,
    restoreInputRef,
    handleImportClick,
    handleFileSelection,
    handleExportBackup,
    handleRestoreClick,
    handleRestoreSelection,
  }
}