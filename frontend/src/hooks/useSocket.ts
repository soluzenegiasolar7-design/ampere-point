import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useLocationStore } from '../stores/location.store'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3002'
let socketInstance: Socket | null = null

export function getSocket() { return socketInstance }

export function useSocket(_role?: string) {
  const initialized = useRef(false)
  const { updateLocation } = useLocationStore()

  useEffect(() => {
    if (initialized.current) return
    const token = localStorage.getItem('ap_token')
    if (!token) return
    initialized.current = true

    socketInstance = io(SOCKET_URL, { auth: { token: `Bearer ${token}` } })

    socketInstance.on('gps:user_location', (data) => {
      updateLocation(data.userId, data)
    })

    return () => {
      socketInstance?.disconnect()
      socketInstance = null
      initialized.current = false
    }
  }, [])

  return socketInstance
}
