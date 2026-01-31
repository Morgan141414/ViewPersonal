import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'

export function KpiCard({
  title,
  value,
  subtitle,
  tone,
  Icon,
}: {
  title: string
  value: string | number
  subtitle?: string
  tone: 'success' | 'warning' | 'danger' | 'info'
  Icon: LucideIcon
}) {
  const toneClasses =
    tone === 'success'
      ? 'border-emerald-500/20 bg-emerald-500/10'
      : tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/10'
        : tone === 'danger'
          ? 'border-rose-500/20 bg-rose-500/10'
          : 'border-indigo-500/20 bg-indigo-500/10'

  const iconClasses =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-300'
        : tone === 'danger'
          ? 'text-rose-300'
          : 'text-indigo-300'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`rounded-xl border ${toneClasses} p-5 shadow-soft`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-white/80">{title}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
          {subtitle ? <div className="mt-1 text-xs text-muted">{subtitle}</div> : null}
        </div>
        <div className={`rounded-xl border border-border bg-surface p-2 ${iconClasses}`}>
          <Icon size={18} />
        </div>
      </div>
    </motion.div>
  )
}
