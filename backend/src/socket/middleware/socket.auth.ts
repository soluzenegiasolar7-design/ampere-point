import { Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'

export function socketAuth(socket: Socket, next: (err?: Error) => void) {
  const token = (socket.handshake.auth?.token as string)?.replace('Bearer ', '')
  if (!token) return next(new Error('Não autorizado'))
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string; role: string }
    socket.data.userId = payload.userId
    socket.data.role = payload.role
    next()
  } catch {
    next(new Error('Token inválido'))
  }
}
