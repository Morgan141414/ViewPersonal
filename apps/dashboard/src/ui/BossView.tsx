import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Camera, Eye, Signal, Users } from 'lucide-react'
import { StatusBadge } from './components/StatusBadge'
import { InsightCard, type Insight } from './components/InsightCard'
import { useCameraAliases } from '../utils/cameraAliases'

type PresenceCurrent = {
  subject: string
  last_seen_ts: string
  source_id: string | null
  event?: string
  confidence: number | null
  privacy_mode: string
}

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
  coreUrl: string
  getCurrentPresence(): Promise<PresenceCurrent[]>
  getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: AiIngestStatus[] }>
  getInsights(minutes?: number, opts?: { source_id?: string; zone?: string }): Promise<{ ok: boolean; window_minutes: number; insights: Insight[] }>
  getRecommendations(minutes?: number, opts?: { source_id?: string; zone?: string }): Promise<{ ok: boolean; window_minutes: number; recommendations: Insight[] }>
  getComplianceZones(): Promise<{ ok: boolean; zones: Array<{ zone_id: string; state: string; violations: string[]; since: string; severity: string; regulation_id?: string }> }>
}

type CameraRow = {
  source_id: string
  online: boolean
  last_seen_ts: string | null
  status: string | null
  subjects: number
  ai_source: string | null
  ai_fps: number | null
  ai_frames_processed: number | null
  ai_last_error: string | null
  ai_pose: boolean | null
}

function isoOrNull(ts: string | null | undefined) {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function fmtLastSeen(ts: string | null) {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function prettyAgo(ts: string | null) {
  if (!ts) return '-'
  const ms = Date.now() - new Date(ts).getTime()
  if (!Number.isFinite(ms)) return '-'
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h`
}

function friendlyError(msg: string) {
  const s = String(msg || '')
  if (!s) return null
  return 'Сервис временно недоступен. Повторяем…'
}

export function BossView({ api, role }: { api: Api; role: string }) {
  const { getAlias } = useCameraAliases()
  const [rows, setRows] = useState<CameraRow[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [recommendations, setRecommendations] = useState<Insight[]>([])
  const [compliance, setCompliance] = useState<Array<{ zone_id: string; state: string; violations: string[]; since: string; severity: string; regulation_id?: string }>>([])
  const [filterSource, setFilterSource] = useState<string>('')
  const [filterZone, setFilterZone] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [coreError, setCoreError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)

  async function refresh() {
    setError(null)
    setCoreError(null)
    setAiError(null)
    setLoading(true)
    try {
      const [presenceRes, ingestRes] = await Promise.allSettled([
        api.getCurrentPresence(),
        api.getAiIngestStatusAll(),
      ])

      const insightsRes = await api.getInsights(60, { source_id: filterSource || undefined, zone: filterZone || undefined }).catch(() => null)
      const recRes = await api.getRecommendations(60, { source_id: filterSource || undefined, zone: filterZone || undefined }).catch(() => null)
      const compRes = await api.getComplianceZones().catch(() => null)

      const presence = presenceRes.status === 'fulfilled' ? presenceRes.value : []
      const ingestAll = ingestRes.status === 'fulfilled' ? ingestRes.value : ({ ok: false, ingests: [] } as any)

      if (insightsRes?.insights) setInsights(insightsRes.insights)
      if (recRes?.recommendations) setRecommendations(recRes.recommendations)
      if (compRes?.zones) setCompliance(compRes.zones)

      if (presenceRes.status === 'rejected') {
        setCoreError(String((presenceRes.reason as any)?.message ?? presenceRes.reason))
      }
      if (ingestRes.status === 'rejected') {
        setAiError(String((ingestRes.reason as any)?.message ?? ingestRes.reason))
      }

      const presenceBySource = new Map<
        string,
        { last_seen_ts: string | null; status: string | null; subjects: number }
      >()

      for (const p of presence) {
        const sid = p.source_id ?? 'unknown'
        const prev = presenceBySource.get(sid)
        const ts = isoOrNull(p.last_seen_ts)
        const status = (p.event ?? 'seen') as string

        if (!prev) {
          presenceBySource.set(sid, { last_seen_ts: ts, status, subjects: 1 })
          continue
        }

        const prevTs = prev.last_seen_ts ? new Date(prev.last_seen_ts).getTime() : 0
        const nextTs = ts ? new Date(ts).getTime() : 0
        presenceBySource.set(sid, {
          last_seen_ts: nextTs >= prevTs ? ts : prev.last_seen_ts,
          status: nextTs >= prevTs ? status : prev.status,
          subjects: prev.subjects + 1,
        })
      }

      const ingestBySource = new Map<string, AiIngestStatus>()
      for (const st of ingestAll.ingests || []) ingestBySource.set(st.source_id, st)

      const sourceIds = new Set<string>()
      for (const sid of ingestBySource.keys()) sourceIds.add(sid)
      for (const sid of presenceBySource.keys()) sourceIds.add(sid)

      const nextRows: CameraRow[] = Array.from(sourceIds)
        .map((source_id) => {
          const ing = ingestBySource.get(source_id)
          const pres = presenceBySource.get(source_id)
          return {
            source_id,
            online: Boolean(ing?.running),
            last_seen_ts: pres?.last_seen_ts ?? null,
            status: pres?.status ?? null,
            subjects: pres?.subjects ?? 0,
            ai_source: ing?.source ?? null,
            ai_fps: ing?.fps ?? null,
            ai_frames_processed: ing?.frames_processed ?? null,
            ai_last_error: ing?.last_error ?? null,
            ai_pose: typeof ing?.pose === 'boolean' ? ing.pose : null,
          }
        })
        .sort((a, b) => a.source_id.localeCompare(b.source_id))

      setRows(nextRows)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  // Realtime-ish: core websocket triggers a refresh; AI status is polled periodically.
  useEffect(() => {
    const wsUrl = api.coreUrl.replace(/^http/, 'ws') + '/ws/presence'
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onmessage = () => {
      refresh().catch(() => {})
    }
    ws.onerror = () => {}
    return () => {
      try {
        ws.close()
      } catch {}
    }
  }, [api.coreUrl])

  useEffect(() => {
    const t = window.setInterval(() => {
      refresh().catch(() => {})
    }, 5000)
    return () => window.clearInterval(t)
  }, [])

  const summary = useMemo(() => {
    const total = rows.length
    const online = rows.filter((r) => r.online).length
    const offline = total - online
    const subjects = rows.reduce((acc, r) => acc + (r.subjects || 0), 0)
    return { total, online, offline }
  }, [rows])

  const alerts = useMemo(() => insights.filter((i) => i.severity !== 'info'), [insights])
  const isManager = role === 'admin' || role === 'hr' || role === 'manager'

  if (!isManager) {
    return <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Аналитика доступна только руководителям.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-semibold">Руководство</div>
          <div className="mt-1 text-sm text-muted">Надёжность и активность верхнего уровня</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={`онлайн ${summary.online}`} tone="success" />
          <StatusBadge label={`оффлайн ${summary.offline}`} tone={summary.offline > 0 ? 'danger' : 'muted'} />
          <StatusBadge label={`всего ${summary.total}`} tone="muted" />
          <button
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface"
            onClick={() => refresh().catch(() => {})}
            disabled={loading}
          >
            {loading ? 'Обновление…' : 'Обновить'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
          {String(error)}
        </div>
      ) : null}

      {coreError || aiError ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-sm text-white/90">
            <AlertTriangle size={16} className="text-amber-300" />
            <span>{friendlyError(coreError || aiError || '')}</span>
          </div>
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer select-none">Детали</summary>
            <div className="mt-2">Ядро: {coreError ?? '-'}</div>
            <div className="mt-1">ИИ: {aiError ?? '-'}</div>
          </details>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted">Камеры онлайн</div>
            <Signal size={18} className="text-white/60" />
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{summary.online}</div>
          <div className="mt-1 text-xs text-muted">Обновление каждые 5с</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted">Камеры оффлайн</div>
            <Camera size={18} className="text-white/60" />
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{summary.offline}</div>
          <div className="mt-1 text-xs text-muted">Нужно внимание</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted">Обнаружено людей</div>
            <Users size={18} className="text-white/60" />
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{rows.reduce((a, r) => a + (r.subjects || 0), 0)}</div>
          <div className="mt-1 text-xs text-muted">По всем камерам</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted">Последняя активность</div>
            <Eye size={18} className="text-white/60" />
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight">{rows.length ? prettyAgo(rows.map((r) => r.last_seen_ts).filter(Boolean).sort().slice(-1)[0] as any) : '-'}</div>
          <div className="mt-1 text-xs text-muted">Время с последнего появления</div>
        </div>
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
              {rows.map((r) => (
                <option key={r.source_id} value={r.source_id}>{getAlias(r.source_id) || r.source_id}</option>
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

      <div>
        <div className="mb-2 text-sm font-semibold">Инсайты</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
          {insights.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Пока нет инсайтов</div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Рекомендации</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {recommendations.map((rec) => (
            <InsightCard key={rec.id} insight={rec} />
          ))}
          {recommendations.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Рекомендаций нет</div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Соответствие по зонам</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {compliance.map((z) => (
            <div key={z.zone_id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{z.zone_id}</div>
                  <div className="mt-1 text-xs text-muted">с {new Date(z.since).toLocaleTimeString()}</div>
                </div>
                <StatusBadge label={z.state} tone={z.state === 'COMPLIANT' ? 'success' : z.state === 'CRITICAL_VIOLATION' ? 'danger' : 'warning'} />
              </div>
              <div className="mt-3 text-xs text-muted">{z.violations.length ? z.violations.join(', ') : 'Нарушений нет'}</div>
            </div>
          ))}
          {compliance.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Пока нет данных соответствия</div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Оповещения</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {alerts.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
          {alerts.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Оповещений нет</div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Камеры</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => (
            <motion.div
              key={r.source_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="rounded-xl border border-border bg-card p-5 shadow-soft"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold">{getAlias(r.source_id) || r.source_id}</div>
                  <div className="mt-1 text-xs text-muted" style={{ wordBreak: 'break-all' }}>{r.ai_source ?? '-'}</div>
                </div>
                <StatusBadge label={r.online ? 'онлайн' : 'оффлайн'} tone={r.online ? 'success' : 'danger'} pulse={r.online} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-muted">последнее появление</div>
                  <div className="mt-1 text-white/90">{prettyAgo(r.last_seen_ts)}</div>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-muted">статус</div>
                  <div className="mt-1 text-white/90">{r.status ?? '-'}</div>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-muted">людей</div>
                  <div className="mt-1 text-white/90">{r.subjects}</div>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-muted">fps</div>
                  <div className="mt-1 text-white/90">{r.ai_fps ?? '-'}</div>
                </div>
              </div>

              {r.ai_last_error ? (
                <div className="mt-3 text-sm text-rose-200">Камера оффлайн. Ожидание потока…</div>
              ) : null}
              <div className="mt-3 text-xs text-muted">Последнее обновление: {fmtLastSeen(r.last_seen_ts)}</div>
            </motion.div>
          ))}
          {rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Пока данных нет</div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 text-xs text-muted">
        Онлайн/оффлайн определяется по подключению AI-инжеста (“running”). Последнее появление/статус — из ядра.
      </div>
    </div>
  )
}
