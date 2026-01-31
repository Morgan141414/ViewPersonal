import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PresenceCard } from '../components/PresenceCard'

type PresenceCurrent = {
  subject: string
  last_seen_ts: string
  source_id: string | null
  event?: string
  confidence: number | null
  privacy_mode: string
}

type Api = {
  coreUrl: string
  getCurrentPresence(): Promise<PresenceCurrent[]>
}

export function PresencePage({ api }: { api: Api }) {
  const [items, setItems] = useState<PresenceCurrent[]>([])
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)

  async function refresh() {
    setError(null)
    try {
      const data = await api.getCurrentPresence()
      setItems(
        (data || []).map((x) => ({
          ...x,
          last_seen_ts: new Date(x.last_seen_ts).toISOString(),
        })),
      )
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  useEffect(() => {
    const wsUrl = api.coreUrl.replace(/^http/, 'ws') + '/ws/presence'
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onmessage = () => refresh().catch(() => {})
    ws.onerror = () => {}
    return () => {
      try {
        ws.close()
      } catch {}
    }
  }, [api.coreUrl])

  const sorted = useMemo(() => {
    return items
      .slice()
      .sort((a, b) => new Date(b.last_seen_ts).getTime() - new Date(a.last_seen_ts).getTime())
  }, [items])

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-semibold">Присутствие</div>
          <div className="mt-1 text-sm text-muted">Люди сейчас (в реальном времени)</div>
        </div>
        <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface" onClick={() => refresh().catch(() => {})}>
          Обновить
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((p) => (
          <PresenceCard
            key={p.subject}
            subject={p.subject}
            event={p.event}
            lastSeenIso={p.last_seen_ts}
            sourceId={p.source_id}
          />
        ))}
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Пока данных нет</div>
        ) : null}
      </div>
    </div>
  )
}
