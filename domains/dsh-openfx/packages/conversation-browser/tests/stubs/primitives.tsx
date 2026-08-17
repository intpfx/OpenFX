/** Minimal visual primitives used only by BrowserView source tests. */
import type { InputHTMLAttributes, ReactNode } from 'react'

export function Tooltip({ children }: { children: ReactNode }): ReactNode {
  return children
}

function Icon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} aria-hidden="true" />
}

export const IconChevronLeftOutline14 = Icon
export const IconChevronRightOutline14 = Icon
export const IconGlobeOutline14 = Icon
export const IconRefreshOutline16 = Icon

export function Input({ icon, className, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode
}) {
  return (
    <label className={className}>
      {icon}
      <input {...props} />
    </label>
  )
}
