import { useEffect, useRef } from 'react'
import { getSocket } from './useSocket'
import { api } from '../services/api'

const QUEUE_KEY = 'gps_offline_queue'
const MAX_QUEUE  = 5000

interface GpsPoint {
  latitude:  number
  longitude: number
  accuracy?: number
  speed?:    number
  timestamp: string
}

function readQueue(): GpsPoint[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

function writeQueue(q: GpsPoint[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)))
}

async function flushQueue() {
  const queue = readQueue()
  if (queue.length === 0) return
  try {
    await api.post('/api/gps-logs/bulk', queue)
    writeQueue([])
  } catch {
    // sem internet — tenta de novo na próxima vez
  }
}

export function useGPS(active: boolean) {
  const watchRef    = useRef<number | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // Sincroniza fila offline ao recuperar conexão
  useEffect(() => {
    const onOnline = () => flushQueue()
    window.addEventListener('online', onOnline)
    flushQueue()
    return () => window.removeEventListener('online', onOnline)
  }, [])

  // Wake Lock — mantém a tela ligada enquanto GPS está ativo
  // Sem wake lock a tela dorme e o watchPosition para no iOS/Android
  useEffect(() => {
    if (!active) {
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
      return
    }

    async function acquireWakeLock() {
      if (!('wakeLock' in navigator)) return
      try {
        const lock = await (navigator as any).wakeLock.request('screen')
        wakeLockRef.current = lock
        // Se a tela foi bloqueada externamente (ex: ligação), reaquire ao voltar
        lock.addEventListener('release', () => {
          if (active) acquireWakeLock()
        })
      } catch {
        // Alguns browsers/dispositivos não suportam — ignora
      }
    }

    acquireWakeLock()

    // Reaquire o wake lock quando a aba volta ao foco (ex: usuário muda de app e volta)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && active) acquireWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [active])

  // GPS watch — maximumAge: 0 = sempre posição fresca, sem cache
  useEffect(() => {
    if (!active || !navigator.geolocation) return

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point: GpsPoint = {
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:  pos.coords.accuracy,
          speed:     pos.coords.speed ?? undefined,
          timestamp: new Date().toISOString(),
        }

        // 1. salva localmente sempre (garante offline)
        const queue = readQueue()
        queue.push(point)
        writeQueue(queue)

        // 2. tenta emitir pelo socket (online)
        const socket = getSocket()
        if (socket?.connected) {
          socket.emit('gps:update', {
            latitude:  point.latitude,
            longitude: point.longitude,
            accuracy:  point.accuracy,
            speed:     point.speed,
          })
          flushQueue()
        }
      },
      (err) => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    )

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
    }
  }, [active])
}
