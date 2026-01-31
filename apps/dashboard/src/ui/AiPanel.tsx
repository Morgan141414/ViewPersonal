import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Brain, FileImage, Flame, MessageCircle, RefreshCcw, Shield, UserPlus } from 'lucide-react'
import { StatusBadge } from './components/StatusBadge'

type Employee = {
  id: string
  external_id: string | null
  full_name: string
  email: string | null
  is_active: boolean
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

type Api = {
  coreUrl: string
  aiUrl: string
  listEmployees(): Promise<Employee[]>
  getAiCurrent(): Promise<AiCurrent[]>
  getHeatmap(minutes?: number): Promise<{ ok: boolean; window_minutes: number; zones: Record<string, number> }>
  faceEnroll(employee_id: string, file: File): Promise<any>
  faceIdentify(file: File, top_k?: number): Promise<any>
  analyzeImage(file: File, opts?: { employee_id?: string; source_id?: string }): Promise<any>
  chatRespond(message: string, context?: any): Promise<{ ok: boolean; reply: string; ts: string; suggestions?: string[] }>
}

function fmtJson(x: any) {
  try {
    return JSON.stringify(x, null, 2)
  } catch {
    return String(x)
  }
}

export function AiPanel({ api }: { api: Api }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [sourceId, setSourceId] = useState('cam-1')

  const [enrollFile, setEnrollFile] = useState<File | null>(null)
  const [identifyFile, setIdentifyFile] = useState<File | null>(null)
  const [analyzeFile, setAnalyzeFile] = useState<File | null>(null)

  const [aiCurrent, setAiCurrent] = useState<AiCurrent[]>([])
  const [heatmap, setHeatmap] = useState<Record<string, number>>({})

  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; ts: string }>>([
    {
      role: 'assistant',
      content: 'Привет! Я могу дать сводку по присутствию, нарушениям и инсайтам. Спросите, что нужно.',
      ts: new Date().toISOString(),
    },
  ])
  const [chatSuggestions, setChatSuggestions] = useState<string[]>([])

  const wsRef = useRef<WebSocket | null>(null)

  async function refresh() {
    const [emps, current, hm] = await Promise.all([
      api.listEmployees(),
      api.getAiCurrent(),
      api.getHeatmap(60),
    ])
    setEmployees(emps)
    setAiCurrent(current)
    setHeatmap(hm.zones || {})
    if (!selectedEmployeeId && emps.length) setSelectedEmployeeId(emps[0].id)
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e?.message ?? e)))
  }, [])

  useEffect(() => {
    const wsUrl = api.coreUrl.replace(/^http/, 'ws') + '/ws/presence'
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onmessage = () => {
      refresh().catch(() => {})
    }
    return () => {
      try {
        ws.close()
      } catch {}
    }
  }, [api.coreUrl])

  async function doEnroll() {
    setError(null)
    setResult(null)
    if (!selectedEmployeeId) return setError('Сначала выберите сотрудника')
    if (!enrollFile) return setError('Выберите файл изображения для добавления')

    setBusy('enroll')
    try {
      const r = await api.faceEnroll(selectedEmployeeId, enrollFile)
      setResult(r)
      await refresh()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(null)
    }
  }

  async function doIdentify() {
    setError(null)
    setResult(null)
    if (!identifyFile) return setError('Выберите файл изображения для идентификации')

    setBusy('identify')
    try {
      const r = await api.faceIdentify(identifyFile, 5)
      setResult(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(null)
    }
  }

  async function doAnalyze() {
    setError(null)
    setResult(null)
    if (!analyzeFile) return setError('Выберите файл изображения для анализа')

    setBusy('analyze')
    try {
      const r = await api.analyzeImage(analyzeFile, { employee_id: selectedEmployeeId || undefined, source_id: sourceId })
      setResult(r)
      await refresh()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(null)
    }
  }

  const latest = useMemo(() => {
    return aiCurrent
      .slice()
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 12)
  }, [aiCurrent])

  async function sendChat(message?: string) {
    const text = (message ?? chatInput).trim()
    if (!text || chatBusy) return
    setChatInput('')
    setChatSuggestions([])
    setChatMessages((prev) => [...prev, { role: 'user', content: text, ts: new Date().toISOString() }])
    setChatBusy(true)
    try {
      const res = await api.chatRespond(text)
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.reply, ts: res.ts }])
      if (res.suggestions?.length) setChatSuggestions(res.suggestions)
    } catch (e: any) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Не удалось получить ответ. Попробуйте ещё раз.', ts: new Date().toISOString() }])
    } finally {
      setChatBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-semibold">ИИ студия</div>
          <div className="mt-1 text-sm text-muted">По умолчанию анонимные инсайты</div>
        </div>
        <button
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface"
          onClick={() => refresh().catch(() => {})}
        >
          <span className="inline-flex items-center gap-2"><RefreshCcw size={14} /> Обновить</span>
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Контекст</div>
            <StatusBadge label="защищено" tone="muted" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-muted">Сотрудник</div>
              <select
                className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-white"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.external_id ?? 'нет external_id'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-muted">Источник</div>
              <input
                className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-white"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                placeholder="cam-1"
              />
            </div>
          </div>
          <div className="mt-4 text-xs text-muted">ИИ: {api.aiUrl} • Ядро: {api.coreUrl}</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Состояние</div>
            <Shield size={16} className="text-white/60" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm"><span className="text-muted">сотрудники</span><span>{employees.length}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-muted">наблюдения</span><span>{aiCurrent.length}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-muted">зоны тепловой карты</span><span>{Object.keys(heatmap).length}</span></div>
          </div>
        </div>
      </div>

      <Tabs.Root defaultValue="live" className="rounded-xl border border-border bg-card shadow-soft">
        <Tabs.List className="flex items-center gap-2 border-b border-border p-3">
          <Tabs.Trigger value="controls" className="rounded-xl px-3 py-2 text-sm text-white/80 data-[state=active]:bg-surface data-[state=active]:text-white">
            <span className="inline-flex items-center gap-2"><Brain size={14} /> Управление</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="live" className="rounded-xl px-3 py-2 text-sm text-white/80 data-[state=active]:bg-surface data-[state=active]:text-white">
            <span className="inline-flex items-center gap-2"><Flame size={14} /> В реальном времени</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="heatmap" className="rounded-xl px-3 py-2 text-sm text-white/80 data-[state=active]:bg-surface data-[state=active]:text-white">
            <span className="inline-flex items-center gap-2"><FileImage size={14} /> Тепловая карта</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="chat" className="rounded-xl px-3 py-2 text-sm text-white/80 data-[state=active]:bg-surface data-[state=active]:text-white">
            <span className="inline-flex items-center gap-2"><MessageCircle size={14} /> Чат</span>
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="controls" className="p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Анализ (анонимно)</div>
                <Brain size={16} className="text-white/60" />
              </div>
              <div className="mt-3 text-xs text-muted">Запускает ИИ и отправляет наблюдение в ядро (ID не требуется)</div>
              <input className="mt-3 w-full text-sm" type="file" accept="image/*" onChange={(e) => setAnalyzeFile(e.target.files?.[0] ?? null)} />
              <button className="mt-3 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-bg" disabled={busy !== null} onClick={doAnalyze}>
                {busy === 'analyze' ? 'Анализ…' : 'Анализировать изображение'}
              </button>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-sm font-semibold">FaceID (опционально)</div>
              <div className="mt-2 text-xs text-muted">Включайте только при соблюдении требований и согласии.</div>
              <details className="mt-3">
                <summary className="cursor-pointer select-none text-xs text-white/80">Показать инструменты FaceID</summary>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Добавить</div>
                      <UserPlus size={14} className="text-white/60" />
                    </div>
                    <input className="mt-3 w-full text-sm" type="file" accept="image/*" onChange={(e) => setEnrollFile(e.target.files?.[0] ?? null)} />
                    <button className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-white/90 hover:bg-bg" disabled={busy !== null} onClick={doEnroll}>
                      {busy === 'enroll' ? 'Добавление…' : 'Добавить лицо'}
                    </button>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Идентификация</div>
                      <FileImage size={14} className="text-white/60" />
                    </div>
                    <input className="mt-3 w-full text-sm" type="file" accept="image/*" onChange={(e) => setIdentifyFile(e.target.files?.[0] ?? null)} />
                    <button className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-white/90 hover:bg-bg" disabled={busy !== null} onClick={doIdentify}>
                      {busy === 'identify' ? 'Идентификация…' : 'Идентифицировать лицо'}
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </div>

          {result ? (
            <details className="mt-4 rounded-xl border border-border bg-surface p-4">
              <summary className="cursor-pointer select-none text-sm text-white/90">Последний результат (JSON)</summary>
              <pre className="mt-3 overflow-auto text-xs text-white/80" style={{ whiteSpace: 'pre-wrap' }}>{fmtJson(result)}</pre>
            </details>
          ) : null}
        </Tabs.Content>

        <Tabs.Content value="live" className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Последние наблюдения</div>
              <div className="mt-1 text-xs text-muted">Из ядра (в реальном времени)</div>
            </div>
            <StatusBadge label={`${latest.length} показано`} tone="muted" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {latest.map((x) => {
              const emp = x.employee_id ? employeesById.get(x.employee_id) : null
              const kpi = x.kpi?.score ?? '-'
              const emo = x.emotion?.label ?? '-'
              const act = x.activity?.label ?? x.activity?.activity ?? '-'
              return (
                <div key={`${x.subject}-${x.ts}`} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold">{emp ? emp.full_name : (x.employee_id ?? x.subject)}</div>
                      <div className="mt-1 text-xs text-muted">{new Date(x.ts).toLocaleString()} • {x.source_id ?? '-'}</div>
                    </div>
                    <StatusBadge label={`KPI ${kpi}`} tone={typeof kpi === 'number' ? (kpi >= 0.7 ? 'success' : kpi >= 0.4 ? 'warning' : 'danger') : 'muted'} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge label={`эмоция ${emo}`} tone="muted" />
                    <StatusBadge label={`активность ${act}`} tone="muted" />
                  </div>
                </div>
              )
            })}

            {latest.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Пока нет наблюдений ИИ</div>
            ) : null}
          </div>
        </Tabs.Content>

        <Tabs.Content value="heatmap" className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Тепловая карта</div>
              <div className="mt-1 text-xs text-muted">События по зонам (последние 60 мин)</div>
            </div>
            <StatusBadge label={`${Object.keys(heatmap).length} зон`} tone="muted" />
          </div>

          <div className="space-y-2">
            {Object.keys(heatmap).length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Пока нет событий положения</div>
            ) : null}
            {Object.entries(heatmap)
              .sort((a, b) => b[1] - a[1])
              .map(([zone, count]) => (
                <div key={zone} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                  <div className="text-sm font-medium">{zone}</div>
                  <StatusBadge label={String(count)} tone="info" />
                </div>
              ))}
          </div>
        </Tabs.Content>

        <Tabs.Content value="chat" className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">AI‑чат</div>
              <div className="mt-1 text-xs text-muted">Сводки и ответы по данным системы</div>
            </div>
          </div>

          <div className="space-y-3">
            {chatMessages.map((m, idx) => (
              <div
                key={`${m.ts}-${idx}`}
                className={`rounded-xl border border-border p-3 text-sm ${m.role === 'user' ? 'bg-card' : 'bg-surface'}`}
              >
                <div className="text-xs text-muted">{m.role === 'user' ? 'Вы' : 'Ассистент'} • {new Date(m.ts).toLocaleTimeString()}</div>
                <div className="mt-2 text-white/90" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
            ))}
          </div>

          {chatSuggestions.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {chatSuggestions.map((s) => (
                <button
                  key={s}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs text-white/90 hover:bg-surface"
                  onClick={() => sendChat(s)}
                  disabled={chatBusy}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex items-end gap-2">
            <textarea
              className="min-h-[56px] w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white"
              placeholder="Например: Покажи нарушения по зонам"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendChat().catch(() => {})
                }
              }}
            />
            <button
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm text-white/90 hover:bg-card"
              onClick={() => sendChat().catch(() => {})}
              disabled={chatBusy}
            >
              {chatBusy ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
