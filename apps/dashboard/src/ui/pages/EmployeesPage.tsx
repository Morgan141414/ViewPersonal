import React, { useEffect, useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'

type Employee = {
  id: string
  full_name: string
  email: string | null
  external_id: string | null
  is_active: boolean
}

type Api = {
  listEmployees(): Promise<Employee[]>
  createEmployee(input: { full_name: string; email?: string | null; external_id?: string | null }): Promise<Employee>
  faceEnroll(employee_id: string, file: File): Promise<{ ok: boolean; employee_id: string; embedding_id: string; quality?: number | null }>
}

export function EmployeesPage({ api }: { api: Api }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [externalId, setExternalId] = useState('')

  const [faceFiles, setFaceFiles] = useState<Record<string, File | null>>({})
  const [facePreviews, setFacePreviews] = useState<Record<string, string>>({})
  const [enrollStatus, setEnrollStatus] = useState<Record<string, string>>({})

  async function refresh() {
    setError(null)
    try {
      const emps = await api.listEmployees()
      setEmployees(emps)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  async function createEmployee() {
    setError(null)
    if (!fullName.trim()) {
      setError('Введите ФИО')
      return
    }
    setLoading(true)
    try {
      const res = await api.createEmployee({
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        external_id: externalId.trim() || undefined,
      })
      setEmployees((prev) => [res, ...prev])
      setFullName('')
      setEmail('')
      setExternalId('')
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  async function enrollFace(employeeId: string) {
    setError(null)
    const file = faceFiles[employeeId]
    if (!file) {
      setEnrollStatus((prev) => ({ ...prev, [employeeId]: 'Выберите изображение' }))
      return
    }
    setEnrollStatus((prev) => ({ ...prev, [employeeId]: 'Загрузка…' }))
    try {
      const res = await api.faceEnroll(employeeId, file)
      const quality = res.quality != null ? `${Math.round(res.quality * 100)}%` : '—'
      setEnrollStatus((prev) => ({ ...prev, [employeeId]: `Готово • качество ${quality}` }))
    } catch (e: any) {
      setEnrollStatus((prev) => ({ ...prev, [employeeId]: String(e?.message ?? e) }))
    }
  }

  const rows = useMemo(() => employees.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)), [employees])

  function setFaceFile(employeeId: string, file: File | null) {
    setFaceFiles((prev) => ({ ...prev, [employeeId]: file }))
    setEnrollStatus((prev) => ({ ...prev, [employeeId]: '' }))
    setFacePreviews((prev) => {
      const next = { ...prev }
      if (next[employeeId]) URL.revokeObjectURL(next[employeeId])
      if (file) next[employeeId] = URL.createObjectURL(file)
      else delete next[employeeId]
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-semibold">Сотрудники</div>
          <div className="mt-1 text-sm text-muted">Регистрация сотрудников и фото для FaceID</div>
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

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-sm font-semibold">Новый сотрудник</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
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
        </div>
        <button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-white/90 hover:bg-bg" onClick={() => createEmployee().catch(() => {})} disabled={loading}>
          <UserPlus size={16} />
          Зарегистрировать
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {rows.map((e) => (
          <div key={e.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{e.full_name}</div>
                <div className="mt-1 text-xs text-muted">{e.email ?? '—'} • {e.external_id ?? '—'}</div>
              </div>
              <div className="text-xs text-muted">{e.is_active ? 'активен' : 'не активен'}</div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[140px_1fr]">
              <div className="h-[140px] w-[140px] overflow-hidden rounded-xl border border-border bg-surface">
                {facePreviews[e.id] ? (
                  <img src={facePreviews[e.id]} alt={e.full_name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted">Нет фото</div>
                )}
              </div>
              <div>
                <div className="text-xs text-muted">Фото лица (для распознавания)</div>
                <input className="mt-2 w-full text-sm" type="file" accept="image/*" onChange={(ev) => setFaceFile(e.id, ev.target.files?.[0] ?? null)} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-white/90 hover:bg-bg" onClick={() => enrollFace(e.id)}>
                    Загрузить лицо
                  </button>
                  {enrollStatus[e.id] ? <span className="text-xs text-muted">{enrollStatus[e.id]}</span> : null}
                </div>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Пока нет сотрудников</div>
        ) : null}
      </div>
    </div>
  )
}
