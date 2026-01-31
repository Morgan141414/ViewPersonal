import React, { useEffect, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { readAliases, writeAliases } from '../../utils/cameraAliases'

type Employee = { id: string; full_name: string; email: string | null; external_id: string | null; is_active: boolean }

type Api = {
  listEmployees(): Promise<Employee[]>
  createEmployee(input: { full_name: string; email?: string | null; external_id?: string | null }): Promise<Employee>
  getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: Array<{ source_id: string }> }>
}

export function SettingsPage({ api }: { api: Api }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [cams, setCams] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [externalId, setExternalId] = useState('')

  const [aliases, setAliases] = useState<Record<string, string>>(() => readAliases())

  async function refresh() {
    setError(null)
    try {
      const [emps, ingests] = await Promise.all([
        api.listEmployees().catch(() => []),
        api.getAiIngestStatusAll().catch(() => ({ ok: true, ingests: [] } as any)),
      ])
      setEmployees(emps as Employee[])
      setCams((ingests.ingests || []).map((x: any) => x.source_id))
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  async function createEmployee() {
    setError(null)
    if (!fullName.trim()) {
      setError('Укажите имя сотрудника')
      return
    }
    try {
      const res = await api.createEmployee({
        full_name: fullName.trim(),
        email: email.trim() || null,
        external_id: externalId.trim() || null,
      })
      setEmployees((prev) => [res, ...prev])
      setFullName('')
      setEmail('')
      setExternalId('')
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  function saveAliases() {
    writeAliases(aliases)
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-semibold">Настройки</div>
          <div className="mt-1 text-sm text-muted">Персонал, камеры и имена</div>
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
          <div className="text-sm font-semibold">Сотрудники</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs text-muted">ФИО</div>
              <input className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-muted">Email (опционально)</div>
              <input className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-muted">Внешний ID (опционально)</div>
              <input className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white" value={externalId} onChange={(e) => setExternalId(e.target.value)} />
            </div>
            <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-bg" onClick={() => createEmployee().catch(() => {})}>
              Добавить сотрудника
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {employees.map((e) => (
              <div key={e.id} className="rounded-xl border border-border bg-card px-3 py-2 text-sm flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{e.full_name}</div>
                  <div className="text-xs text-muted">{e.email ?? '—'} • {e.external_id ?? '—'}</div>
                </div>
                <StatusBadge label={e.is_active ? 'активен' : 'неактивен'} tone={e.is_active ? 'success' : 'muted'} />
              </div>
            ))}
            {employees.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted">Пока нет сотрудников</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="text-sm font-semibold">Имена камер</div>
          <div className="mt-3 space-y-3">
            {cams.map((cid) => (
              <div key={cid} className="grid grid-cols-1 gap-2">
                <div className="text-xs text-muted">{cid}</div>
                <input
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white"
                  placeholder="Например: Ресепшен"
                  value={aliases[cid] ?? ''}
                  onChange={(e) => setAliases((prev) => ({ ...prev, [cid]: e.target.value }))}
                />
              </div>
            ))}
            {cams.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted">Камеры не найдены</div>
            ) : null}
          </div>
          <button className="mt-4 rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-bg" onClick={saveAliases}>
            Сохранить имена
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-sm font-semibold">Информация</div>
        <div className="mt-3 space-y-2 text-sm text-white/90">
          <div>Адаптация под устройства: базовая есть, можем улучшить.</div>
          <div>Вход через Google/др.: можно, но требует OAuth интеграции в API — могу сделать следующим пунктом.</div>
        </div>
      </div>
    </div>
  )
}
