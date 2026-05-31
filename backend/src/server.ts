import { createServer } from 'http'
import { Server } from 'socket.io'
import app from './app'
import { env } from './config/env'
import { initSocket } from './socket/socket.handler'
import fs from 'fs'
import path from 'path'

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: { origin: env.CORS_ORIGIN, credentials: true },
})

initSocket(io)

const uploadDir = path.resolve(env.UPLOAD_DIR)
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

httpServer.listen(parseInt(env.PORT), () => {
  console.log(`AmperePoint backend rodando na porta ${env.PORT}`)
})
