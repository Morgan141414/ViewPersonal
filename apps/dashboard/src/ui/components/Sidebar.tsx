import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  Settings,
  Sparkles,
  GraduationCap,
  Users,
  User,
  Video,
} from 'lucide-react'
import { clsx } from 'clsx'

type NavItem = {
  to: string
  label: string
  Icon: typeof LayoutDashboard
  roles?: string[]
}

const items: NavItem[] = [
  { to: '/overview', label: 'Обзор', Icon: LayoutDashboard },
  { to: '/presence', label: 'Присутствие', Icon: Users },
  { to: '/employees', label: 'Сотрудники', Icon: User },
  { to: '/cameras', label: 'Камеры', Icon: Video },
  { to: '/alerts', label: 'Оповещения', Icon: Bell, roles: ['admin', 'hr', 'manager'] },
  { to: '/ai', label: 'ИИ', Icon: Sparkles },
  { to: '/training', label: 'Обучение', Icon: GraduationCap },
  { to: '/boss', label: 'Руководство', Icon: BarChart3, roles: ['admin', 'hr', 'manager'] },
  { to: '/settings', label: 'Настройки', Icon: Settings },
]

export function Sidebar({
  onLogout,
  role,
  className,
  showOnMobile = false,
  onNavigate,
}: {
  onLogout: () => void
  role: string
  className?: string
  showOnMobile?: boolean
  onNavigate?: () => void
}) {
  const visible = items.filter((item) => !item.roles || item.roles.includes(role))
  return (
    <aside
      className={clsx(
        showOnMobile
          ? 'flex h-[calc(100vh-2rem)] w-[280px] flex-col rounded-2xl border border-border bg-surface p-4'
          : 'sticky top-6 hidden h-[calc(100vh-3rem)] w-[260px] shrink-0 rounded-xl border border-border bg-surface p-4 lg:flex lg:flex-col',
        className,
      )}
    >
      <div>
        <div className="text-base font-semibold tracking-tight">Центр производительности искусственного интеллекта</div>
        <div className="mt-1 text-xs text-muted">Центр управления</div>
      </div>

      <nav className="mt-6 grid gap-1">
        {visible.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
                isActive
                  ? 'bg-card text-white'
                  : 'text-white/80 hover:bg-card hover:text-white',
              )
            }
            onClick={() => onNavigate?.()}
          >
            {({ isActive }) => (
              <>
                <span
                  className={clsx(
                    'absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full transition',
                    isActive ? 'bg-primary' : 'bg-transparent',
                  )}
                />
                <Icon size={18} className={clsx('opacity-90', isActive ? 'text-primary' : 'text-white/70')} />
                <span className="font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-4">
        <button
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-white/90 hover:bg-surface"
          onClick={onLogout}
        >
          Выход
        </button>
      </div>
    </aside>
  )
}
