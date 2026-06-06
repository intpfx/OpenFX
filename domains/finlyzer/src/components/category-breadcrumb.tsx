import type { CSSProperties } from 'react'

const SEPARATOR_STYLE: CSSProperties = { fontSize: 9, opacity: 0.45, flexShrink: 0 }

export function CategoryBreadcrumb({
  path,
  muted = false,
  collapseMiddle = false,
}: {
  path: string
  muted?: boolean
  collapseMiddle?: boolean
}) {
  const parts = path.split('/')
  const displayParts = collapseMiddle && parts.length > 2
    ? [parts[0], '…', parts.at(-1) ?? parts[parts.length - 1]]
    : parts

  return (
    <span className="flex items-center gap-0.5 min-w-0 overflow-hidden" title={path}>
      {displayParts.map((part, index) => (
        <span key={index} className="flex items-center gap-0.5 min-w-0">
          {index > 0 && (
            <span style={SEPARATOR_STYLE} aria-hidden>›</span>
          )}
          <span
            style={{
              fontSize: 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: muted && index < displayParts.length - 1 ? 0.55 : 1,
              fontWeight: index === displayParts.length - 1 ? 500 : 400,
            }}
          >
            {part}
          </span>
        </span>
      ))}
    </span>
  )
}