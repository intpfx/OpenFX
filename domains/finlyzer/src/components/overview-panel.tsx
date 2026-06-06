import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

type OverviewMetric = {
  key: string
  label: string
  value: string
  detail: ReactNode
  tone: 'positive' | 'negative' | 'warning' | 'accent' | 'neutral'
}

export function OverviewPanel({
  metrics,
}: {
  metrics: OverviewMetric[]
}) {
  return (
    <motion.article
      className="panel-card overview-panel"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <div className="overview-kpi-grid">
        {metrics.map((metric) => (
          <article key={metric.key} className={`overview-kpi-card tone-${metric.tone}`}>
            <span className="overview-kpi-label">{metric.label}</span>
            <strong className="overview-kpi-value">{metric.value}</strong>
            <span className="overview-kpi-detail">{metric.detail}</span>
          </article>
        ))}
      </div>
    </motion.article>
  )
}