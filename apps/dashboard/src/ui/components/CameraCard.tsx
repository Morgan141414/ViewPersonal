import React from 'react'
import { motion } from 'framer-motion'
import { Activity, Play, RefreshCcw, Video, VideoOff } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { useCameraAliases } from '../../utils/cameraAliases'

export type CameraStatus = {
  source_id: string
  source: string
  running: boolean
  fps: number
  frames_processed: number
  subjects: number
  pose: boolean
  last_error: string | null
}

function humanCameraError(err: string | null) {
  if (!err) return null
  const s = String(err)
  if (s.toLowerCase().includes('cannot open') || s.toLowerCase().includes('connection refused')) {
    return 'Камера оффлайн. Ожидание потока…'
  }
  if (s.toLowerCase().includes('read failed')) {
    return 'Сигнал нестабилен. Переподключение…'
  }
  return 'Проблема с камерой. Проверьте поток.'
}

export function CameraCard({
  cam,
  onOpen,
  onRestart,
  aiUrl,
  previewNonce,
  previewFps = 2,
}: {
  cam: CameraStatus
  onOpen: () => void
  onRestart: () => void
  aiUrl: string
  previewNonce: number
  previewFps?: number
}) {
  const { getAlias } = useCameraAliases()
  const alias = getAlias(cam.source_id)
  const stateTone = cam.running ? 'success' : 'danger'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border border-border bg-card shadow-soft"
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface">
            {cam.running ? <Video size={18} className="text-white/70" /> : <VideoOff size={18} className="text-white/70" />}
          </div>
          <div>
            <div className="text-sm font-semibold">{alias || cam.source_id}</div>
            <div className="mt-1 text-xs text-muted" style={{ wordBreak: 'break-all' }}>{alias ? cam.source_id : cam.source}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge label={cam.running ? 'онлайн' : 'оффлайн'} tone={stateTone as any} pulse={cam.running} />
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-white/90 hover:bg-card"
            title="Открыть живой просмотр"
          >
            <Play size={14} />
            Живой просмотр
          </button>
          <button
            onClick={onRestart}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-white/90 hover:bg-card"
            title="Перезагрузить поток"
          >
            <RefreshCcw size={14} />
            Перезагрузить
          </button>
        </div>
      </div>

      <div className="relative mx-4 mb-4 overflow-hidden rounded-xl border border-border bg-surface" style={{ aspectRatio: '16 / 9' }}>
        {cam.running ? (
          <img
            src={`${aiUrl}/v1/ingest/stream/${encodeURIComponent(cam.source_id)}?fps=${previewFps}&nonce=${previewNonce}`}
            alt={cam.source_id}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <VideoOff size={22} className="text-white/50" />
            <div className="text-sm font-medium text-white/80">Видео недоступно</div>
            <div className="text-xs text-muted">Проверьте поток камеры</div>
          </div>
        )}

        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <StatusBadge label={`FPS ${cam.fps}`} tone="muted" />
          <StatusBadge label={cam.pose ? 'Поза ВКЛ' : 'Поза ВЫКЛ'} tone={cam.pose ? 'info' : 'muted'} />
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-black/35 px-3 py-1 text-xs text-white/90 backdrop-blur">
            <Activity size={14} className="text-white/80" />
            {cam.subjects} человек
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-black/35 px-3 py-1 text-xs text-white/90 backdrop-blur">
            кадры {cam.frames_processed}
          </span>
        </div>
      </div>

      {humanCameraError(cam.last_error) ? (
        <div className="px-4 pb-4 text-sm text-rose-200">{humanCameraError(cam.last_error)}</div>
      ) : null}
    </motion.div>
  )
}
