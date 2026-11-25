import { Server, Socket } from 'socket.io'

export function registerGpsHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId
  const role = socket.data.role

  // Gestores entram na sala de rastreamento
  if (role === 'ADMIN' || role === 'MANAGER') {
    socket.join('tracking:room')
  }

  // Só repassa a posição ao vivo para o mapa do gestor. A gravação no banco é feita
  // pelo POST /api/gps-logs/bulk (o app sempre enfileira e sincroniza cada ponto),
  // então gravar aqui também duplicava todos os pontos.
  socket.on('gps:update', (data: { latitude: number; longitude: number; accuracy?: number; speed?: number }) => {
    io.to('tracking:room').emit('gps:user_location', { userId, ...data, timestamp: new Date() })
  })
}
