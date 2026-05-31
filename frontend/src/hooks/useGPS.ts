import { useEffect, useRef } from 'react'
import { getSocket } from './useSocket'

export function useGPS(active: boolean) {
  const watchRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active || !navigator.geolocation) return

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const socket = getSocket()
        socket?.emit('gps:update', {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed ?? undefined,
        })
      },
      (err) => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    )

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
    }
  }, [active])
}
