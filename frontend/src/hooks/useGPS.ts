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
  const watchRef = useRef<number | null>(null)

  useEffect(() => {
    // quando a conexão volta, sincroniza a fila
    const onOnline = () => flushQueue()
    window.addEventListener('online', onOnline)

    // tenta sincronizar ao montar (pode já estar online com fila pendente)
    flushQueue()

    return () => window.removeEventListener('online', onOnline)
  }, [])

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
          // flush imediato se acumulou algo offline antes
          flushQueue()
        }
      },
      (err) => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 },
    )

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
    }
  }, [active])
}
