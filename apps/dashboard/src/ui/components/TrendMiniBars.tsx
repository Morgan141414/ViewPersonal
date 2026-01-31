import React from 'react'

type TrendBucket = { day: string; total: number }

export function TrendMiniBars({ buckets, label }: { buckets: TrendBucket[]; label: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.total))

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 text-sm font-semibold">{label}</div>
      <div className="flex h-16 items-end gap-1">
        {buckets.map((b) => (
          <div key={b.day} className="flex h-full flex-1 items-end">
            <div className="w-full rounded-md bg-white/20" style={{ height: `${Math.round((b.total / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{buckets[0]?.day ?? '-'}</span>
        <span>{buckets[buckets.length - 1]?.day ?? '-'}</span>
      </div>
    </div>
  )
}
