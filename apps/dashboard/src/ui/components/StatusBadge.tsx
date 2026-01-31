import React from 'react'
import { clsx } from 'clsx'

export type StatusTone = 'success' | 'warning' | 'danger' | 'muted' | 'info'

export function StatusBadge({
  label,
  tone = 'muted',
  pulse = false,
}: {
  label: string
  tone?: StatusTone
  pulse?: boolean
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
        pulse ? 'animate-pulse' : '',
        tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-200',
        tone === 'danger' && 'border-rose-500/30 bg-rose-500/10 text-rose-200',
        tone === 'info' && 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
        tone === 'muted' && 'border-border bg-surface text-white/80',
      )}
    >
      {label}
    </span>
  )
}
