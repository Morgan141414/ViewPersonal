import React, { useEffect, useMemo, useRef, useState } from 'react'

type PresenceCurrent = {
  subject: string
  last_seen_ts: string
  source_id: string | null
  event?: string
  confidence: number | null
  privacy_mode: string
}

type Api = {
  getCurrentPresence(): Promise<PresenceCurrent[]>
}

export function PresenceTable({ api }: { api: Api }) {
  const [items, setItems] = useState<PresenceCurrent[]>([])
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  async function refresh() {
    const data = await api.getCurrentPresence()
    // normalize ts to ISO strings
    setItems(data.map((x) => ({ ...x, last_seen_ts: new Date(x.last_seen_ts).toISOString() })))
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e?.message ?? e)))
  }, [])

  useEffect(() => {
    const http = (api as any).coreUrl || 'http://127.0.0.1:8000'
    const wsUrl = http.replace(/^http/, 'ws') + '/ws/presence'
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = () => {
      refresh().catch(() => {})
    }
    ws.onerror = () => {
      // ignore; dashboard still works with polling refresh
    }
    return () => {
      try {
        ws.close()
      } catch {}
    }
  }, [])

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="h1">Присутствие в реальном времени</div>
          <div className="muted">WS-обновления; данные сохраняются в БД (SQLite по умолчанию)</div>
        </div>
        <div className="row" />
      </div>

      {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}

      <table className="table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Субъект</th>
            <th>Статус</th>
            <th>Последнее появление</th>
            <th>Источник</th>
            <th>Уверенность</th>
            <th>Приватность</th>
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.subject}>
              <td>{x.subject}</td>
              <td><span className="tag">{x.event ?? 'seen'}</span></td>
              <td>{new Date(x.last_seen_ts).toLocaleString()}</td>
              <td>{x.source_id ?? '-'}</td>
              <td>{x.confidence ?? '-'}</td>
              <td><span className="tag">{x.privacy_mode}</span></td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">Пока данных нет</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
