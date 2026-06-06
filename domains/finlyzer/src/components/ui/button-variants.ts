import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(174_80%_22%)]',
        secondary:
          'border border-[hsl(var(--border))] bg-[hsl(var(--popover))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]',
        destructive:
          'border border-[hsl(4_60%_85%)] bg-[hsl(4_60%_97%)] text-[hsl(var(--destructive))] hover:bg-[hsl(4_60%_93%)]',
        ghost:
          'bg-transparent hover:bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]',
        link: 'text-[hsl(var(--primary))] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 py-1',
        sm: 'h-7 px-2 text-xs',
        lg: 'h-9 px-4',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)