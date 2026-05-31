import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import { env } from './config/env'
import { errorHandler } from './shared/errors/errorHandler'
import authRouter from './modules/auth/auth.router'
import usersRouter from './modules/users/users.router'
import timeEntriesRouter from './modules/time-entries/time-entries.router'
import gpsLogsRouter from './modules/gps-logs/gps-logs.router'
import workDaysRouter from './modules/work-days/work-days.router'

const app = express()

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
app.use(express.json())
app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)))

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/time-entries', timeEntriesRouter)
app.use('/api/gps-logs', gpsLogsRouter)
app.use('/api/work-days', workDaysRouter)

app.use(errorHandler)

export default app
