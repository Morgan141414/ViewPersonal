import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CameraCard, type CameraStatus } from '../components/CameraCard'
import { useCameraAliases } from '../../utils/cameraAliases'

type Employee = { id: string; full_name: string }

type PresenceEvent = {
  ts: string
  employee_id: string | null
  anonymous_track_id?: string | null
  source_id: string | null
  event?: string
  payload?: {
    bbox?: number[]
    preview?: { scale?: number; width?: number; height?: number; orig_width?: number; orig_height?: number }
  }
}

type Api = {
  coreUrl: string
  aiUrl: string
  listEmployees(): Promise<Employee[]>
  getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: any[] }>
}

export function CamerasPage({ api }: { api: Api }) {
  const { getAlias } = useCameraAliases()
  const [cams, setCams] = useState<CameraStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [activeCam, setActiveCam] = useState<CameraStatus | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [presenceBySource, setPresenceBySource] = useState<Record<string, PresenceEvent>>({})
  const [nowTick, setNowTick] = useState<number>(Date.now())
  const presentSinceRef = useRef<Record<string, string>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [frameDims, setFrameDims] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 })

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

  useEffect(() => {
    api.listEmployees().then(setEmployees).catch(() => setEmployees([]))
  }, [])

  useEffect(() => {
    const wsUrl = api.coreUrl.replace(/^http/, 'ws') + '/ws/presence'
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data || '{}')
        if (msg?.type !== 'presence.event') return
        const data = msg.data as PresenceEvent
        if (!data?.source_id) return
        setPresenceBySource((prev) => ({ ...prev, [data.source_id as string]: data }))

        if (data.event === 'away' || !(data.payload?.bbox && data.payload.bbox.length === 4)) {
          delete presentSinceRef.current[data.source_id]
        } else if (!presentSinceRef.current[data.source_id]) {
          presentSinceRef.current[data.source_id] = data.ts
        }
      } catch {
        return
      }
    }
    ws.onerror = () => {}
    return () => {
      try {
        ws.close()
      } catch {}
    }
  }, [api.coreUrl])

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const update = () => {
      const img = imgRef.current
      const frame = frameRef.current
      if (!img || !frame) return
      const rect = frame.getBoundingClientRect()
      const next = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        naturalWidth: img.naturalWidth || 0,
        naturalHeight: img.naturalHeight || 0,
      }
      setFrameDims((prev) => (prev.width === next.width && prev.height === next.height && prev.naturalWidth === next.naturalWidth && prev.naturalHeight === next.naturalHeight ? prev : next))
    }

    update()
    const ro = new ResizeObserver(() => update())
    if (frameRef.current) ro.observe(frameRef.current)
    const t = window.setInterval(() => update(), 500)
    return () => {
      ro.disconnect()
      window.clearInterval(t)
    }
  }, [activeCam, reloadNonce])

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])

  const summary = useMemo(() => {
    const total = cams.length
    const online = cams.filter((c) => c.running).length
    return { total, online, offline: total - online }
  }, [cams])

  const activePresence = useMemo(() => {
    if (!activeCam) return null
    return presenceBySource[activeCam.source_id] || null
  }, [activeCam, presenceBySource])

  const overlay = useMemo(() => {
    if (!activePresence || activePresence.event === 'away') return null
    const bbox = activePresence.payload?.bbox
    if (!bbox || bbox.length !== 4) return null

    const preview = activePresence.payload?.preview
    const scale = preview?.scale && preview.scale > 0 ? preview.scale : 1
    const scaled = [bbox[0] * scale, bbox[1] * scale, bbox[2] * scale, bbox[3] * scale]

    const nw = frameDims.naturalWidth
    const nh = frameDims.naturalHeight
    if (!nw || !nh || !frameDims.width || !frameDims.height) return null

    const sx = frameDims.width / nw
    const sy = frameDims.height / nh
    const [x1, y1, x2, y2] = scaled
    const left = Math.max(0, x1 * sx)
    const top = Math.max(0, y1 * sy)
    const width = Math.max(0, (x2 - x1) * sx)
    const height = Math.max(0, (y2 - y1) * sy)

    const employeeId = activePresence.employee_id
    const name = employeeId ? employeesById.get(employeeId)?.full_name || employeeId : 'Неизвестно'
    const sinceIso = activeCam ? presentSinceRef.current[activeCam.source_id] : null
    const sinceMs = sinceIso ? new Date(sinceIso).getTime() : 0
    const elapsedSec = sinceMs ? Math.max(0, (nowTick - sinceMs) / 1000) : 0

    const minutes = Math.floor(elapsedSec / 60)
    const seconds = Math.floor(elapsedSec % 60)
    const hours = Math.floor(minutes / 60)
    const mm = String(minutes % 60).padStart(2, '0')
    const ss = String(seconds).padStart(2, '0')
    const duration = hours > 0 ? `${hours}ч ${mm}м` : `${mm}:${ss}`

    return { left, top, width, height, name, duration }
  }, [activePresence, activeCam, employeesById, frameDims, nowTick])

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
            aiUrl={api.aiUrl}
            previewNonce={reloadNonce}
            previewFps={2}
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

            <div
              ref={frameRef}
              className="relative mt-4 overflow-hidden rounded-xl border border-border bg-surface"
              style={{ aspectRatio: '16 / 9' }}
            >
              <img
                ref={imgRef}
                src={`${api.aiUrl}/v1/ingest/stream/${encodeURIComponent(activeCam.source_id)}?fps=60&nonce=${reloadNonce}`}
                alt={activeCam.source_id}
                className="h-full w-full object-contain"
              />
              {overlay ? (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute rounded-md border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                    style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height }}
                  />
                  <div
                    className="absolute rounded-md bg-black/70 px-2 py-1 text-xs text-white"
                    style={{ left: overlay.left, top: Math.max(0, overlay.top - 24) }}
                  >
                    {overlay.name} • {overlay.duration}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
