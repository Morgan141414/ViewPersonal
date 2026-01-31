import React, { useEffect, useMemo, useState } from 'react'
import { InsightCard, type Insight } from '../components/InsightCard'
import { useCameraAliases } from '../../utils/cameraAliases'

type Api = {
  getAlerts(minutes?: number, opts?: { source_id?: string; zone?: string }): Promise<{ ok: boolean; window_minutes: number; alerts: Insight[] }>
  getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: Array<{ source_id: string }> }>
}

export function AlertsPage({ api, role }: { api: Api; role: string }) {
  const { getAlias } = useCameraAliases()
  const [alerts, setAlerts] = useState<Insight[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filterSource, setFilterSource] = useState<string>('')
  const [filterZone, setFilterZone] = useState<string>('')
  const [sources, setSources] = useState<string[]>([])

  const isManager = role === 'admin' || role === 'hr' || role === 'manager'

  async function refresh() {
    setError(null)
    try {
      const [a, s] = await Promise.all([
        api.getAlerts(60, { source_id: filterSource || undefined, zone: filterZone || undefined }),
        api.getAiIngestStatusAll().catch(() => ({ ok: true, ingests: [] } as any)),
      ])
      setAlerts(a.alerts || [])
      setSources((s.ingests || []).map((x: any) => x.source_id))
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  const list = useMemo(() => alerts.slice(), [alerts])

  if (!isManager) {
    return <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Оповещения доступны только для руководителей.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-semibold">Оповещения</div>
          <div className="mt-1 text-sm text-muted">Приоритетные операционные сигналы</div>
        </div>
        <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface" onClick={() => refresh().catch(() => {})}>
          Обновить
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="text-sm font-semibold">Фильтры</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-muted">Камера</div>
            <select
              className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white"
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
            >
              <option value="">Все камеры</option>
              {sources.map((sid) => (
                <option key={sid} value={sid}>{getAlias(sid) || sid}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-muted">Зона</div>
            <input
              className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white"
              placeholder="зона-a"
              value={filterZone}
              onChange={(e) => setFilterZone(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface" onClick={() => refresh().catch(() => {})}>
              Применить
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {list.map((alert) => (
          <InsightCard key={alert.id} insight={alert} />
        ))}
        {list.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Оповещений нет</div>
        ) : null}
      </div>
    </div>
  )
}
