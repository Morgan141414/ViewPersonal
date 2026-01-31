import React, { useEffect, useState } from 'react'
import { readAliases, writeAliases } from '../../utils/cameraAliases'

type Api = {
  getAiIngestStatusAll(): Promise<{ ok: boolean; ingests: Array<{ source_id: string }> }>
}

export function SettingsPage({ api }: { api: Api }) {
  const [cams, setCams] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const [aliases, setAliases] = useState<Record<string, string>>(() => readAliases())

  async function refresh() {
    setError(null)
    try {
      const ingests = await api.getAiIngestStatusAll().catch(() => ({ ok: true, ingests: [] } as any))
      setCams((ingests.ingests || []).map((x: any) => x.source_id))
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
          <div className="mt-1 text-sm text-muted">Камеры и системная информация</div>
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

      <div className="grid grid-cols-1 gap-4">
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
