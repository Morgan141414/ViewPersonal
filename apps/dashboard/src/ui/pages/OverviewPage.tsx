import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, UserCheck, UserMinus, UserX } from 'lucide-react'
import { KpiCard } from '../components/KpiCard'
import { StatusBadge } from '../components/StatusBadge'
import { InsightCard, type Insight } from '../components/InsightCard'
import { TimelineBars, type TimelineBucket } from '../components/TimelineBars'
import { TrendMiniBars } from '../components/TrendMiniBars'
import { useCameraAliases } from '../../utils/cameraAliases'

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
  getCurrentPresence(): Promise<PresenceCurrent[]>
  getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: AiIngestStatus[] }>
  getInsights(minutes?: number, opts?: { source_id?: string; zone?: string }): Promise<{ ok: boolean; window_minutes: number; insights: Insight[] }>
  getInsightsTimeline(minutes?: number, bucket?: number, opts?: { source_id?: string }): Promise<{
    ok: boolean
    current: { minutes: number; bucket_minutes: number; buckets: TimelineBucket[] }
    baseline: { minutes: number; bucket_minutes: number; buckets: TimelineBucket[] }
    current_total: number
    baseline_total: number
  }>
  getInsightsTrends(days?: number, opts?: { source_id?: string }): Promise<{
    ok: boolean
    days: number
    buckets: Array<{ day: string; total: number; active: number; idle: number; away: number }>
    current_total: number
    previous_total: number
  }>
}

function eventTone(evt: string | undefined) {
  if (evt === 'active') return 'success'
  if (evt === 'idle') return 'warning'
  if (evt === 'away') return 'danger'
  return 'muted'
}

function eventLabel(evt: string | undefined) {
  const v = evt ?? 'seen'
  if (v === 'active') return 'активен'
  if (v === 'idle') return 'бездействует'
  if (v === 'away') return 'отсутствует'
  if (v === 'seen') return 'замечен'
  return v
}

export function OverviewPage({ api, role }: { api: Api; role: string }) {
  const { getAlias } = useCameraAliases()
  const [presence, setPresence] = useState<PresenceCurrent[]>([])
  const [cameras, setCameras] = useState<AiIngestStatus[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [timeline, setTimeline] = useState<TimelineBucket[]>([])
  const [baseline, setBaseline] = useState<TimelineBucket[]>([])
  const [timelineTotals, setTimelineTotals] = useState<{ current: number; baseline: number } | null>(null)
  const [trend7, setTrend7] = useState<{ buckets: Array<{ day: string; total: number }>; current_total: number; previous_total: number } | null>(null)
  const [trend30, setTrend30] = useState<{ buckets: Array<{ day: string; total: number }>; current_total: number; previous_total: number } | null>(null)
  const [filterSource, setFilterSource] = useState<string>('')
  const [filterZone, setFilterZone] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const nav = useNavigate()

  async function refresh() {
    setError(null)
    try {
      const [pRes, cRes] = await Promise.allSettled([
        api.getCurrentPresence(),
        api.getAiIngestStatusAll(),
      ])

      const iRes = await api.getInsights(60, { source_id: filterSource || undefined, zone: filterZone || undefined }).catch(() => null)
      const tRes = await api.getInsightsTimeline(240, 15, { source_id: filterSource || undefined }).catch(() => null)
      const tr7 = await api.getInsightsTrends(7, { source_id: filterSource || undefined }).catch(() => null)
      const tr30 = await api.getInsightsTrends(30, { source_id: filterSource || undefined }).catch(() => null)

      if (pRes.status === 'fulfilled') setPresence(pRes.value)
      if (cRes.status === 'fulfilled') setCameras(cRes.value.ingests || [])
      if (iRes?.insights) setInsights(iRes.insights)
      if (tRes?.current?.buckets) setTimeline(tRes.current.buckets)
      if (tRes?.baseline?.buckets) setBaseline(tRes.baseline.buckets)
      if (typeof tRes?.current_total === 'number' && typeof tRes?.baseline_total === 'number') {
        setTimelineTotals({ current: tRes.current_total, baseline: tRes.baseline_total })
      }
      if (tr7?.buckets) setTrend7({ buckets: tr7.buckets.map((b: any) => ({ day: b.day, total: b.total })), current_total: tr7.current_total, previous_total: tr7.previous_total })
      if (tr30?.buckets) setTrend30({ buckets: tr30.buckets.map((b: any) => ({ day: b.day, total: b.total })), current_total: tr30.current_total, previous_total: tr30.previous_total })

      if (pRes.status === 'rejected') setError(String((pRes.reason as any)?.message ?? pRes.reason))
      if (cRes.status === 'rejected') setError(String((cRes.reason as any)?.message ?? cRes.reason))
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
    const t = window.setInterval(() => refresh().catch(() => {}), 5000)
    return () => window.clearInterval(t)
  }, [])

  const stats = useMemo(() => {
    const active = presence.filter((x) => (x.event ?? 'seen') === 'active').length
    const idle = presence.filter((x) => (x.event ?? 'seen') === 'idle').length
    const away = presence.filter((x) => (x.event ?? 'seen') === 'away').length
    const camsOnline = cameras.filter((c) => c.running).length
    const camsTotal = cameras.length
    const alerts = insights.filter((i) => i.severity !== 'info').length
    return { active, idle, away, camsOnline, camsTotal, alerts }
  }, [presence, cameras, insights])

  const strip = useMemo(() => {
    return presence
      .slice()
      .sort((a, b) => new Date(b.last_seen_ts).getTime() - new Date(a.last_seen_ts).getTime())
      .slice(0, 12)
  }, [presence])

  const offlineCameras = useMemo(
    () => cameras.filter((c) => !c.running).map((c) => getAlias(c.source_id) || c.source_id),
    [cameras, getAlias],
  )

  const isManager = role === 'admin' || role === 'hr' || role === 'manager'

  return (
    <div className="space-y-6">
      {isManager ? (
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
                {cameras.map((c) => (
                  <option key={c.source_id} value={c.source_id}>{c.source_id}</option>
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
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Активен сейчас" value={stats.active} subtitle="жить" tone="success" Icon={UserCheck} />
        <KpiCard title="Бездельничать" value={stats.idle} subtitle="нужно внимание" tone="warning" Icon={UserMinus} />
        <KpiCard title="Прочь" value={stats.away} subtitle="никакого сигнала" tone="danger" Icon={UserX} />
        {isManager ? (
          <KpiCard title="Оповещения" value={stats.alerts} subtitle="приоритет" tone={stats.alerts > 0 ? 'danger' : 'info'} Icon={Camera} />
        ) : (
          <KpiCard title="Камеры" value={`${stats.camsOnline} / ${stats.camsTotal}`} subtitle="онлайн" tone="info" Icon={Camera} />
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold">Живой статус</div>
            <div className="mt-1 text-xs text-muted">Коснитесь карты, чтобы открыть камеру</div>
          </div>
          <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface" onClick={() => nav('/cameras')}>
            Открытые камеры
          </button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {strip.map((x) => (
            <button
              key={x.subject}
              onClick={() => nav('/cameras')}
              className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-surface"
            >
              <div className="h-9 w-9 rounded-xl border border-border bg-surface" />
              <div>
                <div className="text-sm font-medium leading-tight">
                  {x.subject.startsWith('anon') ? 'Неизвестно' : x.subject}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge label={eventLabel(x.event)} tone={eventTone(x.event) as any} />
                  <span className="text-xs text-muted">{getAlias(x.source_id) || x.source_id || '-'}</span>
                </div>
              </div>
            </button>
          ))}
          {strip.length === 0 ? <div className="text-sm text-muted">Пока данных нет</div> : null}
        </div>
      </div>

      {!isManager ? (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">Фокус оператора</div>
              <div className="mt-1 text-xs text-muted">Держите камеры в сети и реагируйте на живое присутствие.</div>
            </div>
            <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface" onClick={() => nav('/cameras')}>
              Перейти в Камеры
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted">Оффлайн камеры</div>
              <div className="mt-2 text-sm text-white/90">
                {offlineCameras.length ? offlineCameras.join(', ') : 'Все камеры онлайн'}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted">Последнее обновление присутствия</div>
              <div className="mt-2 text-sm text-white/90">
                {strip[0] ? new Date(strip[0].last_seen_ts).toLocaleTimeString() : 'Никакой недавней активности'}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isManager ? (
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
      ) : null}

      {isManager ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TimelineBars buckets={timeline} label="Таймлайн сегодня" />
          <TimelineBars buckets={baseline} label="Базовый уровень (предыдущее окно)" />
        </div>
      ) : null}

      {isManager ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <div className="text-sm font-semibold">Сегодня vs базовый уровень</div>
          <div className="mt-2 flex items-center gap-4">
            <span className="text-muted">текущий:</span>
            <span className="text-white/90">{timelineTotals?.current ?? '-'}</span>
            <span className="text-muted">базовый:</span>
            <span className="text-white/90">{timelineTotals?.baseline ?? '-'}</span>
            {timelineTotals ? (
              <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-white/80">
                {timelineTotals.current - timelineTotals.baseline >= 0 ? '+' : ''}{timelineTotals.current - timelineTotals.baseline}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {isManager ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {trend7 ? (
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <div className="text-sm font-semibold">Тренд за 7 дней</div>
              <div className="mt-2 flex items-center gap-4 text-sm">
                <span className="text-muted">текущий:</span>
                <span>{trend7.current_total}</span>
                <span className="text-muted">предыдущий:</span>
                <span>{trend7.previous_total}</span>
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-white/80">
                  {trend7.current_total - trend7.previous_total >= 0 ? '+' : ''}{trend7.current_total - trend7.previous_total}
                </span>
              </div>
              <div className="mt-3">
                <TrendMiniBars buckets={trend7.buckets} label="Последние 7 дней" />
              </div>
            </div>
          ) : null}

          {trend30 ? (
            <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <div className="text-sm font-semibold">Тренд за 30 дней</div>
              <div className="mt-2 flex items-center gap-4 text-sm">
                <span className="text-muted">текущий:</span>
                <span>{trend30.current_total}</span>
                <span className="text-muted">предыдущий:</span>
                <span>{trend30.previous_total}</span>
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-white/80">
                  {trend30.current_total - trend30.previous_total >= 0 ? '+' : ''}{trend30.current_total - trend30.previous_total}
                </span>
              </div>
              <div className="mt-3">
                <TrendMiniBars buckets={trend30.buckets} label="Последние 30 дней" />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
