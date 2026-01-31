import React from 'react'

export type TimelineBucket = {
  ts: string
  counts: { seen: number; active: number; idle: number; away: number }
}

function total(b: TimelineBucket) {
  return b.counts.seen + b.counts.active + b.counts.idle + b.counts.away
}

export function TimelineBars({
  buckets,
  label,
}: {
  buckets: TimelineBucket[]
  label?: string
}) {
  const max = Math.max(1, ...buckets.map((b) => total(b)))

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 text-sm font-semibold">{label ?? 'Timeline'}</div>
      <div className="flex h-24 items-end gap-1">
        {buckets.map((b) => {
          const h = Math.round((total(b) / max) * 100)
          return (
            <div key={b.ts} className="flex h-full flex-1 items-end">
              <div className="w-full rounded-md bg-white/20" style={{ height: `${h}%` }} />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{buckets[0] ? new Date(buckets[0].ts).toLocaleTimeString() : '-'}</span>
        <span>{buckets[buckets.length - 1] ? new Date(buckets[buckets.length - 1].ts).toLocaleTimeString() : '-'}</span>
      </div>
    </div>
  )
}
