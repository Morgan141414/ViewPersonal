import React, { useEffect, useMemo, useState } from 'react'
import { CameraCard, type CameraStatus } from '../components/CameraCard'
import { useCameraAliases } from '../../utils/cameraAliases'

type Api = {
  aiUrl: string
  getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: any[] }>
}

export function CamerasPage({ api }: { api: Api }) {
  const { getAlias } = useCameraAliases()
  const [cams, setCams] = useState<CameraStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [activeCam, setActiveCam] = useState<CameraStatus | null>(null)

  async function refresh() {
    setError(null)
    try {
      const res = await api.getAiIngestStatusAll()
      const items = (res.ingests || []) as CameraStatus[]
      setCams(items.slice().sort((a, b) => a.source_id.localeCompare(b.source_id)))
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setCams([])
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
    const t = window.setInterval(() => refresh().catch(() => {}), 5000)
    return () => window.clearInterval(t)
  }, [])

  const summary = useMemo(() => {
    const total = cams.length
    const online = cams.filter((c) => c.running).length
    return { total, online, offline: total - online }
  }, [cams])

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-semibold">Камеры</div>
          <div className="mt-1 text-sm text-muted">Живой просмотр + статус</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="tag">онлайн: {summary.online}</span>
          <span className="tag">оффлайн: {summary.offline}</span>
          <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface" onClick={() => refresh().catch(() => {})}>
            Обновить
          </button>
          <button className="btn" onClick={() => setReloadNonce((n) => n + 1)}>Перезагрузить потоки</button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {cams.map((c) => (
          <CameraCard
            key={c.source_id}
            cam={c}
            onOpen={() => setActiveCam(c)}
            onRestart={() => setReloadNonce((n) => n + 1)}
          />
        ))}
        {cams.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Пока данных нет</div>
        ) : null}
      </div>

      {activeCam ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Живой просмотр — {getAlias(activeCam.source_id) || activeCam.source_id}</div>
                <div className="mt-1 text-xs text-muted">{activeCam.source}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-white/90 hover:bg-card"
                  onClick={() => setReloadNonce((n) => n + 1)}
                >
                  Перезагрузить поток
                </button>
                <button
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-white/90 hover:bg-card"
                  onClick={() => setActiveCam(null)}
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface" style={{ aspectRatio: '16 / 9' }}>
              <img
                src={`${api.aiUrl}/v1/ingest/stream/${encodeURIComponent(activeCam.source_id)}?fps=60&nonce=${reloadNonce}`}
                alt={activeCam.source_id}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
