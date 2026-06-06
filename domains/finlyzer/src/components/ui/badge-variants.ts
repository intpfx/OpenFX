import { cva } from 'class-variance-authority'

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
        secondary: 'border-transparent bg-[hsl(220_14%_92%)] text-[hsl(var(--muted-foreground))]',
        destructive: 'border-[hsl(4_60%_85%)] bg-[hsl(4_60%_97%)] text-[hsl(var(--destructive))]',
        outline: 'text-[hsl(var(--foreground))]',
        idle: 'border-transparent bg-[hsl(220_14%_92%)] text-[hsl(215_16%_40%)]',
        processing: 'border-transparent bg-[hsl(210_70%_92%)] text-[hsl(215_60%_35%)]',
        success: 'border-transparent bg-[hsl(160_50%_88%)] text-[hsl(160_60%_25%)]',
        partial: 'border-transparent bg-[hsl(40_80%_92%)] text-[hsl(40_70%_30%)]',
        error: 'border-transparent bg-[hsl(4_60%_93%)] text-[hsl(var(--destructive))]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)