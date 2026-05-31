import { Server } from 'socket.io'
import { socketAuth } from './middleware/socket.auth'
import { registerGpsHandlers } from './handlers/gps.handler'

export function initSocket(io: Server) {
  io.use(socketAuth)

  io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.data.userId} (${socket.data.role})`)
    registerGpsHandlers(io, socket)
    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.data.userId}`)
    })
  })
}
