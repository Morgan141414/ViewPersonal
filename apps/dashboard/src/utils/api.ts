type TokenOut = { access_token: string; token_type: string }
type MeOut = { id: string; email: string; role: string; is_active: boolean }

type Employee = {
  id: string
  external_id: string | null
  full_name: string
  email: string | null
  is_active: boolean
}

type PresenceCurrent = {
  subject: string
  last_seen_ts: string
  source_id: string | null
  event?: string
  confidence: number | null
  privacy_mode: string
}

type AiCurrent = {
  subject: string
  ts: string
  employee_id: string | null
  source_id: string | null
  face: any
  activity: any
  emotion: any
  kpi: any
}

type Heatmap = { ok: boolean; window_minutes: number; zones: Record<string, number> }
type InsightsOut = { ok: boolean; window_minutes: number; insights: any[] }
type InsightsTimelineOut = {
  ok: boolean
  current: { minutes: number; bucket_minutes: number; buckets: any[] }
  baseline: { minutes: number; bucket_minutes: number; buckets: any[] }
  current_total: number
  baseline_total: number
}
type InsightsTrendsOut = {
  ok: boolean
  days: number
  buckets: Array<{ day: string; total: number; active: number; idle: number; away: number }>
  current_total: number
  previous_total: number
}
type RecommendationsOut = { ok: boolean; window_minutes: number; recommendations: any[] }
type AlertsOut = { ok: boolean; window_minutes: number; alerts: any[] }
type ChatOut = { ok: boolean; reply: string; ts: string; insights?: any[]; compliance?: { violations: number }; suggestions?: string[] }
type TrainingJobsOut = { ok: boolean; jobs: any[] }
type TrainingJobOut = { ok: boolean; job: any }
type TrainingDatasetOut = {
  ok: boolean
  window_minutes: number
  source_id?: string | null
  counts: { presence: number; ai: number; position: number }
  samples: any
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

type FaceEnrollOut = { ok: boolean; employee_id: string; embedding_id: string; quality?: number | null }
type FaceIdentifyOut = { ok: boolean; matches: Array<{ employee_id: string; score: number }> }
type AnalyzeOut = { ok: boolean; face?: any; pose?: any; emotion?: any; kpi?: any }

function httpError(status: number, text: string) {
  const err = new Error(text)
  ;(err as any).status = status
  return err
}

export function api(token: string | null) {
  const coreUrl = (import.meta as any).env?.VITE_CORE_URL || 'http://127.0.0.1:8000'
  const aiUrl = (import.meta as any).env?.VITE_AI_URL || 'http://127.0.0.1:9000'
  const offline = token === 'offline'

  async function request(path: string, init?: RequestInit) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(init?.headers as any),
    }
    if (token) headers['authorization'] = `Bearer ${token}`

    const res = await fetch(`${coreUrl}${path}`, { ...init, headers })
    const bodyText = await res.text()
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('token')
        window.dispatchEvent(new CustomEvent('auth:invalid'))
        const err = new Error('')
        ;(err as any).status = 401
        ;(err as any).silent = true
        throw err
      }
      throw httpError(res.status, bodyText || res.statusText)
    }
    return bodyText ? JSON.parse(bodyText) : null
  }

  if (offline) {
    return {
      coreUrl,
      aiUrl,

      async login() {
        return { access_token: 'offline', token_type: 'bearer' } as TokenOut
      },

      async listEmployees(): Promise<Employee[]> {
        return []
      },

      async createEmployee(input: { full_name: string; email?: string | null; external_id?: string | null }): Promise<Employee> {
        return {
          id: crypto.randomUUID(),
          full_name: input.full_name,
          email: input.email ?? null,
          external_id: input.external_id ?? null,
          is_active: true,
        }
      },

      async getCurrentPresence(): Promise<PresenceCurrent[]> {
        return []
      },

      async getAiCurrent(): Promise<AiCurrent[]> {
        return []
      },

      async getHeatmap(): Promise<Heatmap> {
        return { ok: true, window_minutes: 60, zones: {} }
      },

      async getInsights(): Promise<InsightsOut> {
        return { ok: true, window_minutes: 60, insights: [] }
      },

      async getInsightsTimeline(): Promise<InsightsTimelineOut> {
        return {
          ok: true,
          current: { minutes: 240, bucket_minutes: 15, buckets: [] },
          baseline: { minutes: 240, bucket_minutes: 15, buckets: [] },
          current_total: 0,
          baseline_total: 0,
        }
      },

      async getInsightsTrends(): Promise<InsightsTrendsOut> {
        return { ok: true, days: 7, buckets: [], current_total: 0, previous_total: 0 }
      },

      async getRecommendations(): Promise<RecommendationsOut> {
        return { ok: true, window_minutes: 60, recommendations: [] }
      },

      async getAlerts(): Promise<AlertsOut> {
        return { ok: true, window_minutes: 60, alerts: [] }
      },

      async getComplianceZones() {
        return { ok: true, zones: [] }
      },

      async getComplianceZone() {
        return { ok: true, zone: { zone_id: '-', state: 'UNKNOWN', violations: [], since: new Date().toISOString(), severity: 'info' } }
      },

      async getMe(): Promise<MeOut> {
        return { id: 'offline', email: 'admin@example.com', role: 'admin', is_active: true }
      },

      async ingestPresenceEvent() {
        return { ok: true }
      },

      async seedDemo() {
        return { ok: true }
      },

      async faceEnroll() {
        return { ok: false, employee_id: '', embedding_id: '' }
      },

      async faceIdentify() {
        return { ok: true, matches: [] }
      },

      async analyzeImage() {
        return { ok: false }
      },

      async getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: AiIngestStatus[] }> {
        return { ok: true, ingests: [] }
      },

      async chatRespond(message: string): Promise<ChatOut> {
        return {
          ok: true,
          reply: `Оффлайн-режим: сервисы недоступны. Ваш запрос: ${message}`,
          ts: new Date().toISOString(),
          suggestions: ['Сводка за последний час', 'Покажи нарушения по зонам'],
        }
      },

      async getTrainingJobs(): Promise<TrainingJobsOut> {
        return { ok: true, jobs: [] }
      },

      async createTrainingJob(): Promise<TrainingJobOut> {
        return {
          ok: true,
          job: {
            id: crypto.randomUUID(),
            name: 'Оффлайн-джоба',
            status: 'queued',
            created_at: new Date().toISOString(),
            window_minutes: 60,
            sources: [],
          },
        }
      },

      async getTrainingDatasetSnapshot(): Promise<TrainingDatasetOut> {
        return {
          ok: true,
          window_minutes: 60,
          counts: { presence: 0, ai: 0, position: 0 },
          samples: { presence: [], ai: [], position: [] },
        }
      },
    }
  }

  return {
    coreUrl,
    aiUrl,

    async login(email: string, password: string): Promise<TokenOut> {
      return request('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    },

    async listEmployees(): Promise<Employee[]> {
      return request('/v1/employees/', { method: 'GET' })
    },

    async createEmployee(input: { full_name: string; email?: string | null; external_id?: string | null }): Promise<Employee> {
      return request('/v1/employees/', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async getCurrentPresence(): Promise<PresenceCurrent[]> {
      return request('/v1/presence/current', { method: 'GET' })
    },

    async getAiCurrent(): Promise<AiCurrent[]> {
      return request('/v1/ai/current', { method: 'GET' })
    },

    async chatRespond(message: string, context?: any): Promise<ChatOut> {
      return request('/v1/chat/respond', {
        method: 'POST',
        body: JSON.stringify({ message, context: context ?? {} }),
      })
    },

    async getHeatmap(minutes = 60): Promise<Heatmap> {
      return request(`/v1/position/heatmap?minutes=${encodeURIComponent(String(minutes))}`, { method: 'GET' })
    },

    async getInsights(minutes = 60, opts?: { source_id?: string; zone?: string }): Promise<InsightsOut> {
      const params = new URLSearchParams({ minutes: String(minutes) })
      if (opts?.source_id) params.set('source_id', opts.source_id)
      if (opts?.zone) params.set('zone', opts.zone)
      return request(`/v1/insights?${params.toString()}`, { method: 'GET' })
    },

    async getInsightsTimeline(minutes = 240, bucket = 15, opts?: { source_id?: string }): Promise<InsightsTimelineOut> {
      const params = new URLSearchParams({ minutes: String(minutes), bucket: String(bucket) })
      if (opts?.source_id) params.set('source_id', opts.source_id)
      return request(`/v1/insights/timeline?${params.toString()}`, { method: 'GET' })
    },

    async getInsightsTrends(days = 7, opts?: { source_id?: string }): Promise<InsightsTrendsOut> {
      const params = new URLSearchParams({ days: String(days) })
      if (opts?.source_id) params.set('source_id', opts.source_id)
      return request(`/v1/insights/trends?${params.toString()}`, { method: 'GET' })
    },

    async getRecommendations(minutes = 60, opts?: { source_id?: string; zone?: string }): Promise<RecommendationsOut> {
      const params = new URLSearchParams({ minutes: String(minutes) })
      if (opts?.source_id) params.set('source_id', opts.source_id)
      if (opts?.zone) params.set('zone', opts.zone)
      return request(`/v1/insights/recommendations?${params.toString()}`, { method: 'GET' })
    },

    async getAlerts(minutes = 60, opts?: { source_id?: string; zone?: string }): Promise<AlertsOut> {
      const params = new URLSearchParams({ minutes: String(minutes) })
      if (opts?.source_id) params.set('source_id', opts.source_id)
      if (opts?.zone) params.set('zone', opts.zone)
      return request(`/v1/alerts?${params.toString()}`, { method: 'GET' })
    },

    async getComplianceZones(): Promise<{ ok: boolean; zones: Array<{ zone_id: string; state: string; violations: string[]; since: string; severity: string }> }> {
      return request('/v1/compliance/zones', { method: 'GET' })
    },

    async getComplianceZone(zone_id: string): Promise<{ ok: boolean; zone: { zone_id: string; state: string; violations: string[]; since: string; severity: string; regulation_id?: string } }> {
      return request(`/v1/compliance/zones/${encodeURIComponent(zone_id)}`, { method: 'GET' })
    },

    async getMe(): Promise<MeOut> {
      return request('/v1/auth/me', { method: 'GET' })
    },

    async ingestPresenceEvent(input: {
      employee_id?: string | null
      anonymous_track_id?: string | null
      source_id?: string | null
      event: string
      confidence?: number | null
      payload?: any
    }) {
      return request('/v1/presence/events', {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          payload: input.payload ?? {},
        }),
      })
    },

    async seedDemo(input?: { tracks?: number; events_per_track?: number }) {
      return request('/v1/dev/seed', {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      })
    },

    async faceEnroll(employee_id: string, file: File): Promise<FaceEnrollOut> {
      const fd = new FormData()
      fd.append('employee_id', employee_id)
      fd.append('image', file)

      const res = await fetch(`${aiUrl}/v1/face/enroll`, { method: 'POST', body: fd })
      const text = await res.text()
      if (!res.ok) throw httpError(res.status, text || res.statusText)
      return text ? JSON.parse(text) : (null as any)
    },

    async faceIdentify(file: File, top_k = 3): Promise<FaceIdentifyOut> {
      const fd = new FormData()
      fd.append('top_k', String(top_k))
      fd.append('image', file)

      const res = await fetch(`${aiUrl}/v1/face/identify`, { method: 'POST', body: fd })
      const text = await res.text()
      if (!res.ok) throw httpError(res.status, text || res.statusText)
      return text ? JSON.parse(text) : (null as any)
    },

    async analyzeImage(file: File, opts?: { employee_id?: string; source_id?: string }): Promise<AnalyzeOut> {
      const fd = new FormData()
      if (opts?.employee_id) fd.append('employee_id', opts.employee_id)
      if (opts?.source_id) fd.append('source_id', opts.source_id)
      fd.append('image', file)

      const res = await fetch(`${aiUrl}/v1/vision/analyze_image`, { method: 'POST', body: fd })
      const text = await res.text()
      if (!res.ok) throw httpError(res.status, text || res.statusText)
      return text ? JSON.parse(text) : (null as any)
    },

    async getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: AiIngestStatus[] }> {
      const res = await fetch(`${aiUrl}/v1/ingest/status/all`, { method: 'GET' })
      const text = await res.text()
      if (!res.ok) throw httpError(res.status, text || res.statusText)
      return text ? JSON.parse(text) : (null as any)
    },

    async getTrainingJobs(): Promise<TrainingJobsOut> {
      return request('/v1/training/jobs', { method: 'GET' })
    },

    async createTrainingJob(input: { name: string; window_minutes: number; sources?: string[] }): Promise<TrainingJobOut> {
      return request('/v1/training/jobs', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    async getTrainingDatasetSnapshot(minutes = 60, source_id?: string): Promise<TrainingDatasetOut> {
      const params = new URLSearchParams({ minutes: String(minutes) })
      if (source_id) params.set('source_id', source_id)
      return request(`/v1/training/datasets/snapshot?${params.toString()}`, { method: 'GET' })
    },
  }
}
