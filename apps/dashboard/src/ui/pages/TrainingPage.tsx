import React, { useEffect, useMemo, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'

type TrainingJob = {
  id: string
  name: string
  status: string
  created_at: string
  window_minutes: number
  sources?: string[]
}

type DatasetSnapshot = {
  ok: boolean
  window_minutes: number
  source_id?: string | null
  counts: { presence: number; ai: number; position: number }
  samples: {
    presence: Array<{ ts: string; event: string; source_id: string | null }>
    ai: Array<{ ts: string; source_id: string | null; kpi?: any }>
    position: Array<{ ts: string; source_id: string | null; zone?: string | null }>
  }
}

type Api = {
  getTrainingJobs(): Promise<{ ok: boolean; jobs: TrainingJob[] }>
  createTrainingJob(input: { name: string; window_minutes: number; sources?: string[] }): Promise<{ ok: boolean; job: TrainingJob }>
  getTrainingDatasetSnapshot(minutes?: number, source_id?: string): Promise<DatasetSnapshot>
}

export function TrainingPage({ api }: { api: Api }) {
  const [jobs, setJobs] = useState<TrainingJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [jobName, setJobName] = useState('Обучение модели')
  const [jobWindow, setJobWindow] = useState(60)
  const [jobSources, setJobSources] = useState('')

  const [snapshotMinutes, setSnapshotMinutes] = useState(60)
  const [snapshotSource, setSnapshotSource] = useState('')
  const [snapshot, setSnapshot] = useState<DatasetSnapshot | null>(null)

  async function refresh() {
    setError(null)
    setLoading(true)
    try {
      const res = await api.getTrainingJobs()
      setJobs(res.jobs || [])
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  async function createJob() {
    setError(null)
    try {
      const sources = jobSources
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      await api.createTrainingJob({ name: jobName || 'Обучение модели', window_minutes: Number(jobWindow) || 60, sources: sources.length ? sources : undefined })
      await refresh()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  async function loadSnapshot() {
    setError(null)
    try {
      const res = await api.getTrainingDatasetSnapshot(Number(snapshotMinutes) || 60, snapshotSource || undefined)
      setSnapshot(res)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  const sortedJobs = useMemo(() => jobs.slice(), [jobs])

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-semibold">Обучение</div>
          <div className="mt-1 text-sm text-muted">Запуск джобов и снимок датасета</div>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="text-sm font-semibold">Новая джоба</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs text-muted">Название</div>
              <input className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white" value={jobName} onChange={(e) => setJobName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-muted">Окно данных, минут</div>
              <input className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white" type="number" min={5} max={1440} value={jobWindow} onChange={(e) => setJobWindow(Number(e.target.value))} />
            </div>
            <div>
              <div className="text-xs text-muted">Камеры (через запятую)</div>
              <input className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white" placeholder="camera-1, camera-2" value={jobSources} onChange={(e) => setJobSources(e.target.value)} />
            </div>
            <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-bg" onClick={() => createJob().catch(() => {})}>
              Запустить
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="text-sm font-semibold">Снимок датасета</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs text-muted">Окно, минут</div>
              <input className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white" type="number" min={5} max={1440} value={snapshotMinutes} onChange={(e) => setSnapshotMinutes(Number(e.target.value))} />
            </div>
            <div>
              <div className="text-xs text-muted">Камера (опционально)</div>
              <input className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white" placeholder="camera-1" value={snapshotSource} onChange={(e) => setSnapshotSource(e.target.value)} />
            </div>
            <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-bg" onClick={() => loadSnapshot().catch(() => {})}>
              Получить снимок
            </button>
          </div>

          {snapshot ? (
            <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted">Окно: {snapshot.window_minutes} мин</div>
                <StatusBadge label={`presence ${snapshot.counts.presence}`} tone="muted" />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                <div>AI: {snapshot.counts.ai}</div>
                <div>Position: {snapshot.counts.position}</div>
                <div>Source: {snapshot.source_id ?? '-'}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Джобы обучения</div>
        <div className="grid grid-cols-1 gap-3">
          {sortedJobs.map((job) => (
            <div key={job.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{job.name}</div>
                  <div className="mt-1 text-xs text-muted">{new Date(job.created_at).toLocaleString()}</div>
                </div>
                <StatusBadge label={job.status} tone={job.status === 'queued' ? 'warning' : 'muted'} />
              </div>
              <div className="mt-2 text-xs text-muted">Окно: {job.window_minutes} мин • Камеры: {(job.sources || []).join(', ') || 'все'}</div>
            </div>
          ))}
          {sortedJobs.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Пока нет джоб</div>
          ) : null}
        </div>
      </div>

      {loading ? <div className="text-xs text-muted">Загрузка…</div> : null}
    </div>
  )
}
