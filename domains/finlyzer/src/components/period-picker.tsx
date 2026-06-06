import { useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatMonth } from '@/lib/formatters'

export function PeriodPicker({
  selectedMonths,
  onChangeMonths,
  months,
  size = 'default',
  className,
  triggerLabel,
}: {
  selectedMonths: string[] | null
  onChangeMonths: (months: string[] | null) => void
  months: string[]
  size?: 'default' | 'sm'
  className?: string
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)

  const yearGroups = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const month of months) {
      const year = month.slice(0, 4)
      if (!groups.has(year)) groups.set(year, [])
      groups.get(year)!.push(month)
    }
    return Array.from(groups.entries())
      .map(([year, groupedMonths]) => ({ year, months: groupedMonths.sort() }))
      .sort((left, right) => right.year.localeCompare(left.year))
  }, [months])

  const label = useMemo(() => {
    if (!selectedMonths || selectedMonths.length === 0) return '全部账期'
    if (selectedMonths.length === 1) return formatMonth(selectedMonths[0])
    for (const { year, months: yearMonths } of yearGroups) {
      if (selectedMonths.length === yearMonths.length && yearMonths.every((month) => selectedMonths.includes(month))) {
        return `${year}年（全年）`
      }
    }
    const years = new Set(selectedMonths.map((month) => month.slice(0, 4)))
    if (years.size === 1) return `${[...years][0]}年 · ${selectedMonths.length}个月`
    return `已选 ${selectedMonths.length} 个月`
  }, [selectedMonths, yearGroups])

  function toggleMonth(month: string) {
    if (!selectedMonths) {
      onChangeMonths([month])
    } else if (selectedMonths.includes(month)) {
      const nextMonths = selectedMonths.filter((item) => item !== month)
      onChangeMonths(nextMonths.length === 0 ? null : nextMonths)
    } else {
      onChangeMonths([...selectedMonths, month])
    }
  }

  function toggleYear(yearMonths: string[]) {
    const allSelected = yearMonths.every((month) => selectedMonths?.includes(month))
    if (allSelected) {
      const nextMonths = (selectedMonths ?? []).filter((month) => !yearMonths.includes(month))
      onChangeMonths(nextMonths.length === 0 ? null : nextMonths)
    } else {
      const existingMonths = selectedMonths ?? []
      onChangeMonths([...new Set([...existingMonths, ...yearMonths])])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={months.length === 0}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] cursor-pointer',
            size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
            months.length === 0 && 'opacity-50 pointer-events-none',
            className,
          )}
        >
          <span className="table-head-pill-prefix">{triggerLabel ?? (months.length === 0 ? '日期' : label)}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-3 w-[280px]" align="start">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => { onChangeMonths(null); setOpen(false) }}
            className={cn(
              'text-left text-sm px-2 py-1.5 rounded-md transition-colors',
              !selectedMonths
                ? 'bg-[hsl(220_14%_94%)] text-[hsl(var(--foreground))] font-medium'
                : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(220_14%_96%)]',
            )}
          >
            全部账期
          </button>

          {yearGroups.map(({ year, months: yearMonths }) => {
            const allSelected = yearMonths.every((month) => selectedMonths?.includes(month))
            const someSelected = yearMonths.some((month) => selectedMonths?.includes(month))
            return (
              <div key={year} className="flex flex-col gap-1.5">
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => toggleYear(yearMonths)}
                >
                  <div
                    className={cn(
                      'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0',
                      allSelected
                        ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]'
                        : someSelected
                          ? 'border-[hsl(var(--primary))]'
                          : 'border-[hsl(var(--border))]',
                    )}
                  >
                    {allSelected && <Check className="h-2.5 w-2.5 text-white" />}
                    {someSelected && !allSelected && (
                      <span className="block h-0.5 w-2 rounded-full bg-[hsl(var(--primary))]" />
                    )}
                  </div>
                  <span className="text-xs font-semibold">{year}年</span>
                </div>
                <div className="grid grid-cols-4 gap-1 pl-5">
                  {yearMonths.map((month) => {
                    const active = selectedMonths?.includes(month) ?? false
                    return (
                      <button
                        key={month}
                        type="button"
                        onClick={() => toggleMonth(month)}
                        className={cn(
                          'text-xs py-1 rounded-md text-center transition-colors',
                          active
                            ? 'bg-[hsl(var(--primary))] text-white font-medium'
                            : 'bg-[hsl(220_14%_96%)] text-[hsl(var(--foreground))] hover:bg-[hsl(220_14%_90%)]',
                        )}
                      >
                        {month.slice(5)}月
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}