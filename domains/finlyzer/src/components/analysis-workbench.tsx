import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkbenchChartKey } from '@/lib/analytics/workbench'

export type WorkbenchCard = {
  key: WorkbenchChartKey
  title: string
  eyebrow: string
  metric: string
  detail: string
  summary: string
  tone: 'trend' | 'distribution' | 'calendar' | 'matrix'
}

export function AnalysisWorkbench({
  expandedWorkbenchChart,
  expandedWorkbenchCard,
  workbenchCards,
  expandWorkbenchChart,
  collapseWorkbenchChart,
  renderWorkbenchCard,
}: {
  expandedWorkbenchChart: WorkbenchChartKey | null
  expandedWorkbenchCard: WorkbenchCard
  workbenchCards: WorkbenchCard[]
  expandWorkbenchChart: (chartKey: WorkbenchChartKey) => void
  collapseWorkbenchChart: () => void
  renderWorkbenchCard: (card: WorkbenchCard, mode: 'thumbnail' | 'expanded') => ReactNode
}) {
  return (
    <motion.article
      className="analysis-workbench"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="analysis-workbench-canvas">
        {expandedWorkbenchChart ? (
          <div className="analysis-focus-shell">
            <article
              className={cn('analysis-card-shell', 'expanded', `tone-${expandedWorkbenchCard.tone}`)}
              style={{ viewTransitionName: `analysis-card-${expandedWorkbenchCard.key}` }}
            >
              <div className="analysis-card-toolbar">
                <button
                  type="button"
                  className="analysis-card-close"
                  aria-label="返回图表概览"
                  onClick={collapseWorkbenchChart}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>返回</span>
                </button>
              </div>
              {renderWorkbenchCard(expandedWorkbenchCard, 'expanded')}
            </article>
          </div>
        ) : (
          <div className="analysis-card-grid">
            {workbenchCards.map((card) => (
              <article
                key={card.key}
                className={cn('analysis-card-shell', 'thumbnail', `tone-${card.tone}`)}
                style={{ viewTransitionName: `analysis-card-${card.key}` }}
                role="button"
                tabIndex={0}
                aria-label={`展开${card.title}`}
                onClick={() => expandWorkbenchChart(card.key)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    expandWorkbenchChart(card.key)
                  }
                }}
              >
                <div className="analysis-card-scale-shell">
                  {renderWorkbenchCard(card, 'thumbnail')}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </motion.article>
  )
}