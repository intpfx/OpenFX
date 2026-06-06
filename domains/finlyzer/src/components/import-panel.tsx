import type { RefObject } from 'react'
import { motion } from 'framer-motion'
import { Download, RotateCcw, SquarePen, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ImportSummary } from '@/types/transaction'

export function ImportPanel({
  statusLabel,
  statusVariant,
  note,
  importSummary,
  importInputRef,
  restoreInputRef,
  onImportClick,
  onManualClick,
  onExportBackup,
  onRestoreClick,
  onFileSelection,
  onRestoreSelection,
}: {
  statusLabel: string
  statusVariant: 'idle' | 'processing' | 'success' | 'partial' | 'error'
  note: string
  importSummary: ImportSummary | null
  importInputRef: RefObject<HTMLInputElement | null>
  restoreInputRef: RefObject<HTMLInputElement | null>
  onImportClick: () => void
  onManualClick: () => void
  onExportBackup: () => Promise<void>
  onRestoreClick: () => void
  onFileSelection: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRestoreSelection: (event: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <motion.article
      className="panel-card panel-card-import-compact"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <div className="import-compact-shell">
        <div className="status-row import-status-row">
          <Badge variant={statusVariant}>
            {statusLabel}
          </Badge>
          <span className="status-note">{note || '等待导入文件。'}</span>
        </div>

        <Button className="import-primary-action" size="sm" onClick={onImportClick}>
          <Upload className="h-3.5 w-3.5" />
          选择文件并导入
        </Button>

        <Button variant="secondary" className="import-primary-action" size="sm" onClick={onManualClick}>
          <SquarePen className="h-3.5 w-3.5" />
          手动录入应付/应得
        </Button>

        <div className="import-secondary-actions">
          <Button variant="secondary" size="sm" className="import-secondary-action" onClick={() => void onExportBackup()}>
            <Download className="h-3.5 w-3.5" />
            备份导出
          </Button>
          <Button variant="secondary" size="sm" className="import-secondary-action" onClick={onRestoreClick}>
            <RotateCcw className="h-3.5 w-3.5" />
            恢复导入
          </Button>
        </div>
      </div>

      <input
        ref={importInputRef}
        type="file"
        hidden
        multiple
        accept=".csv,.txt,.xls,.xlsx"
        onChange={onFileSelection}
      />
      <input
        ref={restoreInputRef}
        type="file"
        hidden
        accept="application/json,.json"
        onChange={onRestoreSelection}
      />

      {importSummary && importSummary.failures.length > 0 && (
        <details className="failure-box" open>
          <summary>失败条目明细（{importSummary.failures.length}）</summary>
          <div className="failure-list">
            {importSummary.failures.map((item, index) => (
              <article key={`${item.fileName}-${item.rowNumber}-${index}`}>
                <strong>{item.fileName}</strong>
                <span>行: {item.rowNumber ?? '-'}</span>
                <span>原因: {item.reason}</span>
                {item.raw ? <code>{item.raw}</code> : null}
              </article>
            ))}
          </div>
        </details>
      )}
    </motion.article>
  )
}