import React from 'react'
import { motion } from 'framer-motion'
import { Camera, Clock, User } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { useCameraAliases } from '../../utils/cameraAliases'

function toneFromEvent(evt: string | undefined) {
  if (evt === 'active') return 'success'
  if (evt === 'idle') return 'warning'
  if (evt === 'away') return 'danger'
  return 'muted'
}

function borderFromEvent(evt: string | undefined) {
  if (evt === 'active') return 'border-emerald-500/25'
  if (evt === 'idle') return 'border-amber-500/25'
  if (evt === 'away') return 'border-rose-500/25'
  return 'border-border'
}

function prettyAgo(tsIso: string) {
  const ms = Date.now() - new Date(tsIso).getTime()
  if (!Number.isFinite(ms)) return '-'
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h`
}

export function PresenceCard({
  subject,
  event,
  lastSeenIso,
  sourceId,
}: {
  subject: string
  event: string | undefined
  lastSeenIso: string
  sourceId: string | null
}) {
  const { getAlias } = useCameraAliases()
  const displayName = subject.startsWith('anon') ? 'Неизвестно' : subject
  const tone = toneFromEvent(event)
  const label = (() => {
    const evt = event ?? 'seen'
    if (evt === 'active') return 'активен'
    if (evt === 'idle') return 'бездействует'
    if (evt === 'away') return 'отсутствует'
    if (evt === 'seen') return 'замечен'
    return evt
  })()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`rounded-xl border ${borderFromEvent(event)} bg-card p-5 shadow-soft`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface">
            <User size={18} className="text-white/70" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">{displayName}</div>
            <div className="mt-1">
              <StatusBadge label={label} tone={tone as any} pulse={event === 'active'} />
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-muted">приватность</div>
          <div className="mt-1 text-xs text-white/80">анонимно</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-white/80">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-white/60" />
          <span className="text-muted">последнее появление</span>
          <span>{prettyAgo(lastSeenIso)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Camera size={14} className="text-white/60" />
          <span className="text-muted">камера</span>
          <span>{getAlias(sourceId) || sourceId || '-'}</span>
        </div>
      </div>
    </motion.div>
  )
}
