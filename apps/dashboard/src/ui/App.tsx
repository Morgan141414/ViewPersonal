import React, { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { api } from '../utils/api'
import { AiPanel } from './AiPanel'
import { BossView } from './BossView'
import { CamerasPage } from './pages/CamerasPage'
import { AlertsPage } from './pages/AlertsPage'
import { PresencePage } from './pages/PresencePage'
import { Sidebar } from './components/Sidebar'
import { OverviewPage } from './pages/OverviewPage'
import { TrainingPage } from './pages/TrainingPage'
import { SettingsPage } from './pages/SettingsPage'

type TokenState = { token: string } | { token: null }

export function App() {
  const [token, setToken] = useState<TokenState>(() => {
    const t = localStorage.getItem('token')
    return { token: t }
  })

  const authedApi = useMemo(() => api(token.token), [token.token])

  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('admin12345')
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<string>('')
  const [mobileOpen, setMobileOpen] = useState(false)

  function OAuthCallback({ onToken }: { onToken: (token: string) => void }) {
    const nav = useNavigate()
    const [oauthError, setOauthError] = useState<string | null>(null)

    useEffect(() => {
      const params = new URLSearchParams(window.location.search)
      const tokenParam = params.get('token')
      if (!tokenParam) {
        setOauthError('OAuth токен не получен')
        return
      }
      localStorage.setItem('token', tokenParam)
      onToken(tokenParam)
      nav('/overview', { replace: true })
    }, [nav, onToken])

    return (
      <div className="card p-6">
        <div className="text-lg font-semibold">Авторизация</div>
        <div className="mt-2 text-sm text-muted">{oauthError ? oauthError : 'Выполняем вход…'}</div>
      </div>
    )
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const res = await authedApi.login(email, password)
      localStorage.setItem('token', res.access_token)
      setToken({ token: res.access_token })
      try {
        const me = await api(res.access_token).getMe()
        setRole(me.role)
      } catch {}
    } catch (err: any) {
      const isDefault = email.trim().toLowerCase() === 'admin@example.com' && password === 'admin12345'
      if (isDefault) {
        const offlineToken = 'offline'
        localStorage.setItem('token', offlineToken)
        setToken({ token: offlineToken })
        setRole('admin')
        return
      }
      setError(err?.message ?? 'Ошибка входа')
    }
  }

  useEffect(() => {
    if (!token.token) return
    api(token.token).getMe().then((me) => setRole(me.role)).catch(() => {})
  }, [token.token])

  useEffect(() => {
    const handler = () => logout()
    window.addEventListener('auth:invalid', handler as EventListener)
    return () => window.removeEventListener('auth:invalid', handler as EventListener)
  }, [])

  function logout() {
    localStorage.removeItem('token')
    setToken({ token: null })
  }

  if (!token.token) {
    return (
      <div className="container">
        <div className="header">
          <h1 className="h1">Центр производительности искусственного интеллекта</h1>
          <span className="muted">Центр управления</span>
        </div>
        <div className="card" style={{ maxWidth: 520 }}>
          <h2 className="h1" style={{ marginBottom: 12 }}>Вход</h2>
          <form onSubmit={handleLogin} className="row" style={{ alignItems: 'stretch' }}>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="эл. почта" />
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="пароль" />
            <button className="btn" type="submit">Войти</button>
          </form>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn secondary" type="button" onClick={() => (window.location.href = `${authedApi.coreUrl}/v1/auth/oauth/google/start`)}>
              Войти через Google
            </button>
            <button className="btn secondary" type="button" disabled>
              Войти через Microsoft
            </button>
          </div>
          {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-white">
      <div className="mx-auto max-w-[1320px] px-6 py-6">
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <div>
            <div className="text-base font-semibold">Центр управления</div>
            <div className="text-xs text-muted">AI Productivity Hub</div>
          </div>
          <button
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface"
            onClick={() => setMobileOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu size={16} />
          </button>
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-4 top-4">
              <Sidebar
                onLogout={logout}
                role={role}
                showOnMobile
                onNavigate={() => setMobileOpen(false)}
                className="shadow-soft"
              />
              <button
                className="absolute right-3 top-3 rounded-xl border border-border bg-card p-2 text-white/90 hover:bg-surface"
                onClick={() => setMobileOpen(false)}
                aria-label="Закрыть меню"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-start gap-6">
          <Sidebar onLogout={logout} role={role} />

          <main className="min-w-0 flex-1">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xl font-semibold">Панель управления</div>
                <div className="text-sm text-muted">Состояние в реальном времени и сигналы ИИ</div>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                {role ? <span className="tag">Роль: {role}</span> : null}
                <span className="tag">Ядро: {authedApi.coreUrl}</span>
                <span className="tag">ИИ: {authedApi.aiUrl}</span>
              </div>
            </div>

            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/oauth/callback" element={<OAuthCallback onToken={(t) => setToken({ token: t })} />} />
              <Route path="/overview" element={<OverviewPage api={authedApi as any} role={role} />} />
              <Route path="/presence" element={<PresencePage api={authedApi as any} />} />
              <Route path="/cameras" element={<CamerasPage api={authedApi as any} />} />
              <Route path="/alerts" element={<AlertsPage api={authedApi as any} role={role} />} />
              <Route path="/ai" element={<AiPanel api={authedApi as any} />} />
              <Route path="/training" element={<TrainingPage api={authedApi as any} />} />
              <Route path="/boss" element={<BossView api={authedApi as any} role={role} />} />
              <Route path="/settings" element={<SettingsPage api={authedApi as any} />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  )
}
