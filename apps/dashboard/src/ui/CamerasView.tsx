import React, { useEffect, useMemo, useState } from 'react'

type AiIngestStatus = {
  running: boolean
  source: string
  source_id: string
  fps: number
  frames_processed: number
  last_error: string | null
  subjects: number
  pose: boolean
}

type Api = {
  aiUrl: string
  getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: AiIngestStatus[] }>
}

export function CamerasView({ api }: { api: Api }) {
  const [ingests, setIngests] = useState<AiIngestStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  const summary = useMemo(() => {
    const total = ingests.length
    const online = ingests.filter((x) => x.running).length
    return { total, online, offline: total - online }
  }, [ingests])

  async function refresh() {
    setError(null)
    setLoading(true)
    try {
      const r = await api.getAiIngestStatusAll()
      setIngests((r.ingests || []).slice().sort((a, b) => a.source_id.localeCompare(b.source_id)))
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setIngests([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
    const t = window.setInterval(() => refresh().catch(() => {}), 5000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="h1">Камеры</div>
          <div className="muted">Живой просмотр (MJPEG) из сервиса ИИ</div>
        </div>
        <div className="row">
          <span className="tag">онлайн: {summary.online}</span>
          <span className="tag">оффлайн: {summary.offline}</span>
          <span className="tag">всего: {summary.total}</span>
          <button className="btn secondary" onClick={() => refresh().catch(() => {})} disabled={loading}>
            {loading ? 'Обновление…' : 'Обновить'}
          </button>
          <button className="btn" onClick={() => setReloadNonce((n) => n + 1)}>Перезагрузить потоки</button>
        </div>
      </div>

      {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}

      <div className="grid" style={{ marginTop: 12 }}>
        {ingests.map((cam) => {
          const url = `${api.aiUrl}/v1/ingest/stream/${encodeURIComponent(cam.source_id)}?fps=60&nonce=${reloadNonce}`
          return (
            <div key={cam.source_id} className="card" style={{ background: '#f9fafb' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="h1">{cam.source_id}</div>
                <span className="tag">{cam.running ? 'онлайн' : 'оффлайн'}</span>
              </div>

              <div className="muted" style={{ marginTop: 6, marginBottom: 8, wordBreak: 'break-all' }}>
                {cam.source}
              </div>

              <div style={{ borderRadius: 12, border: '1px solid #e6e8ef', background: '#fff', overflow: 'hidden', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {cam.running ? (
                  <img style={{ width: '100%', display: 'block' }} src={url} alt={cam.source_id} />
                ) : (
                  <div className="muted">Нет видео (оффлайн)</div>
                )}
              </div>

              <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                <span className="muted">кадры: {cam.frames_processed}</span>
                <span className="muted">поза: {cam.pose ? 'вкл' : 'выкл'}</span>
              </div>

              <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                <span className="muted">fps: {cam.fps}</span>
                <a href={url} target="_blank" rel="noreferrer" className="muted">открыть</a>
              </div>

              {cam.last_error ? <div className="error" style={{ marginTop: 8 }}>{cam.last_error}</div> : null}
            </div>
          )
        })}

        {ingests.length === 0 ? <div className="muted">Пока данных нет</div> : null}
      </div>
    </div>
  )
}
