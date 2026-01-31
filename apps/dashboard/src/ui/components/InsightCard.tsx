import React from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'

export type Insight = {
  id: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  summary: string
  ts: string
  meta?: Record<string, any>
}

function iconFor(severity: Insight['severity']) {
  if (severity === 'warning' || severity === 'critical') return AlertTriangle
  return severity === 'info' ? Info : CheckCircle2
}

function toneFor(severity: Insight['severity']) {
  if (severity === 'critical') return 'danger'
  if (severity === 'warning') return 'warning'
  return 'muted'
}

function labelFor(severity: Insight['severity']) {
  if (severity === 'critical') return 'критично'
  if (severity === 'warning') return 'предупреждение'
  return 'инфо'
}

export function InsightCard({ insight }: { insight: Insight }) {
  const Icon = iconFor(insight.severity)

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold">{insight.title}</div>
          <div className="mt-1 text-xs text-muted">{new Date(insight.ts).toLocaleString()}</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface">
          <Icon size={16} className="text-white/70" />
        </div>
      </div>
      <div className="mt-3 text-sm text-white/85">{insight.summary}</div>
      <div className="mt-3 inline-flex rounded-full border border-border bg-surface px-3 py-1 text-xs text-white/80">
        {labelFor(insight.severity)}
      </div>
    </div>
  )
}
