import { Server, Socket } from 'socket.io'
import { createLog } from '../../modules/gps-logs/gps-logs.service'

export function registerGpsHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId
  const role = socket.data.role

  // Gestores entram na sala de rastreamento
  if (role === 'ADMIN' || role === 'MANAGER') {
    socket.join('tracking:room')
  }

  socket.on('gps:update', async (data: { latitude: number; longitude: number; accuracy?: number; speed?: number }) => {
    try {
      await createLog(userId, data)
      io.to('tracking:room').emit('gps:user_location', { userId, ...data, timestamp: new Date() })
    } catch (e) {
      console.error('gps:update error', e)
    }
  })
}
