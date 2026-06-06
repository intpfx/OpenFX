import { CategoryCombobox, type CategoryOption } from '@/components/category-combobox'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getManualEntryTypeByCategoryPath } from '@/lib/categoryTree'
import { cn } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'

function parseDateInput(value: string): Date | undefined {
  if (!value) {
    return undefined
  }

  const [year, month, day] = value.split('-').map((part) => Number(part))
  if (!year || !month || !day) {
    return undefined
  }

  const nextDate = new Date(year, month - 1, day)
  return Number.isNaN(nextDate.getTime()) ? undefined : nextDate
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateLabel(value: string): string {
  const parsedDate = parseDateInput(value)
  if (!parsedDate) {
    return '选择日期'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(parsedDate)
}

export function ManualCommitmentDialog({
  open,
  date,
  amount,
  content,
  categoryPath,
  categoryOptions,
  onOpenChange,
  onDateChange,
  onAmountChange,
  onContentChange,
  onCategoryPathChange,
  onSubmit,
}: {
  open: boolean
  date: string
  amount: string
  content: string
  categoryPath: string
  categoryOptions: CategoryOption[]
  onOpenChange: (open: boolean) => void
  onDateChange: (value: string) => void
  onAmountChange: (value: string) => void
  onContentChange: (value: string) => void
  onCategoryPathChange: (value: string) => void
  onSubmit: () => Promise<void>
}) {
  const selectedDate = parseDateInput(date)
  const currentEntryType = getManualEntryTypeByCategoryPath(categoryPath)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="manual-entry-dialog" showCloseButton={false}>
        <DialogHeader className="manual-entry-dialog-header">
          <div className="manual-entry-header-band">
            <span className="manual-entry-header-kicker">承诺记录</span>
            <span className="manual-entry-header-rail">先记账，再人工结转</span>
          </div>
          <DialogTitle className="manual-entry-title">手动录入承诺记录</DialogTitle>
          <DialogDescription className="manual-entry-description">用一条完整描述记录这笔应付或应得事项，后续系统会按金额和同一描述线索给出待结转候选。</DialogDescription>
        </DialogHeader>
        <div className="manual-entry-sheet">
          <label className="manual-entry-row manual-entry-row-category">
            <span className="manual-entry-label">分类</span>
            <div className="manual-entry-control">
              <CategoryCombobox
                value={categoryPath}
                onValueChange={onCategoryPathChange}
                options={categoryOptions}
                placeholder={currentEntryType === 'payable' ? '支出/应付支出' : '收入/应得收入'}
                className="manual-entry-category"
              />
            </div>
          </label>

          <label className="manual-entry-row manual-entry-row-main">
            <div className="manual-entry-row-head">
              <span className="manual-entry-label">记录内容</span>
              <span className="manual-entry-note">这条描述会同时用于列表标题和后续匹配线索</span>
            </div>
            <div className="manual-entry-control">
              <textarea
                value={content}
                onChange={(event) => onContentChange(event.target.value)}
                className="manual-entry-textarea"
                rows={4}
                placeholder="例如：3 月房租，合同编号 2481，待 3 月底付款&#10;例如：项目尾款第二笔，客户张三，待确认到账"
              />
            </div>
          </label>

          <div className="manual-entry-meta-grid">
            <label className="manual-entry-row manual-entry-row-meta">
              <span className="manual-entry-label">日期</span>
              <div className="manual-entry-control">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      className={cn('manual-entry-date-trigger justify-between text-left font-normal', !selectedDate && 'text-[hsl(var(--muted-foreground))]')}
                    >
                      <span>{formatDateLabel(date)}</span>
                      <CalendarDays className="h-4 w-4 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(nextDate) => {
                        if (nextDate) {
                          onDateChange(formatDateInput(nextDate))
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </label>

            <label className="manual-entry-row manual-entry-row-meta">
              <span className="manual-entry-label">金额</span>
              <div className="manual-entry-control">
                <input
                  value={amount}
                  onChange={(event) => onAmountChange(event.target.value)}
                  inputMode="decimal"
                  placeholder="输入正数金额"
                  className="manual-entry-amount-input"
                />
              </div>
            </label>
          </div>

          <div className="manual-entry-footer">
            <div className="manual-entry-footer-copy">
              <strong>{currentEntryType === 'payable' ? '将新增一条应付支出承诺' : '将新增一条应得收入承诺'}</strong>
              <span>保存后不会自动结转，后续需要在表格中人工确认对应真实流水。</span>
            </div>
            <Button className="manual-entry-submit" onClick={() => void onSubmit()}>
              保存记录
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}