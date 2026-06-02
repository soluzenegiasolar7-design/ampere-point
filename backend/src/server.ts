process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason)
  process.exit(1)
})

console.log('Iniciando servidor...')
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('PORT:', process.env.PORT)
console.log('DATABASE_URL definida:', !!process.env.DATABASE_URL)

import { createServer } from 'http'
import { Server } from 'socket.io'
import app from './app'
import { env } from './config/env'
import { initSocket } from './socket/socket.handler'
import { setIo } from './socket/io'
import fs from 'fs'
import path from 'path'

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
})

setIo(io)
initSocket(io)

const uploadDir = path.resolve(env.UPLOAD_DIR)
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const port = parseInt(process.env.PORT || '3002')
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`AmperePoint backend rodando na porta ${port}`)
})
