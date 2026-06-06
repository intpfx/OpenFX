import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, getDefaultClassNames, type DayPickerProps } from 'react-day-picker'
import { zhCN } from 'react-day-picker/locale'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: DayPickerProps) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      locale={zhCN}
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('flex flex-col gap-4 sm:flex-row', defaultClassNames.months),
        month: cn('space-y-4', defaultClassNames.month),
        month_caption: cn('relative flex items-center justify-center px-8 pt-1', defaultClassNames.month_caption),
        caption_label: cn('text-sm font-semibold text-[hsl(var(--foreground))]', defaultClassNames.caption_label),
        nav: cn('absolute inset-x-0 top-1 flex items-center justify-between', defaultClassNames.nav),
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'h-7 w-7 rounded-md border border-transparent bg-transparent p-0 text-[hsl(var(--muted-foreground))] opacity-80 hover:opacity-100',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'h-7 w-7 rounded-md border border-transparent bg-transparent p-0 text-[hsl(var(--muted-foreground))] opacity-80 hover:opacity-100',
          defaultClassNames.button_next,
        ),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn('w-9 text-[0.78rem] font-medium text-[hsl(var(--muted-foreground))]', defaultClassNames.weekday),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        day: cn('h-9 w-9 p-0 text-center text-sm', defaultClassNames.day),
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 rounded-md p-0 text-sm font-normal aria-selected:opacity-100',
          defaultClassNames.day_button,
        ),
        selected: cn(
          'rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))] focus:bg-[hsl(var(--primary))] focus:text-[hsl(var(--primary-foreground))]',
          defaultClassNames.selected,
        ),
        today: cn('rounded-md border border-[hsl(var(--border))] font-semibold text-[hsl(var(--foreground))]', defaultClassNames.today),
        outside: cn('text-[hsl(var(--muted-foreground))] opacity-45 aria-selected:bg-[hsl(var(--accent))] aria-selected:text-[hsl(var(--muted-foreground))] aria-selected:opacity-30', defaultClassNames.outside),
        disabled: cn('text-[hsl(var(--muted-foreground))] opacity-40', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName, ...iconProps }) => {
          if (orientation === 'left') {
            return <ChevronLeft className={cn('h-4 w-4', iconClassName)} {...iconProps} />
          }

          return <ChevronRight className={cn('h-4 w-4', iconClassName)} {...iconProps} />
        },
      }}
      {...props}
    />
  )
}