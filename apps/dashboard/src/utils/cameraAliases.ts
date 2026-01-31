import { useEffect, useMemo, useState } from 'react'

export type CameraAliases = Record<string, string>

const STORAGE_KEY = 'camera_aliases'

export function readAliases(): CameraAliases {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeAliases(next: CameraAliases) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('camera-aliases:updated'))
}

export function useCameraAliases() {
  const [aliases, setAliases] = useState<CameraAliases>(() => readAliases())

  useEffect(() => {
    const handler = () => setAliases(readAliases())
    window.addEventListener('camera-aliases:updated', handler as EventListener)
    window.addEventListener('storage', handler as EventListener)
    return () => {
      window.removeEventListener('camera-aliases:updated', handler as EventListener)
      window.removeEventListener('storage', handler as EventListener)
    }
  }, [])

  const getAlias = useMemo(() => {
    return (sourceId?: string | null) => {
      if (!sourceId) return ''
      return aliases[sourceId] || ''
    }
  }, [aliases])

  return { aliases, getAlias }
}
