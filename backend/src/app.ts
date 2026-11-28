import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { env } from './config/env'
import { errorHandler } from './shared/errors/errorHandler'
import authRouter from './modules/auth/auth.router'
import usersRouter from './modules/users/users.router'
import timeEntriesRouter from './modules/time-entries/time-entries.router'
import gpsLogsRouter from './modules/gps-logs/gps-logs.router'
import workDaysRouter from './modules/work-days/work-days.router'
import gpsExtRouter from './modules/gps-ext/gps-ext.router'
import payslipsRouter from './modules/payslips/payslips.router'
import absencesRouter from './modules/absences/absences.router'
import vacationsRouter from './modules/vacations/vacations.router'
import dayOffsRouter from './modules/day-offs/day-offs.router'
import timeAdjustmentsRouter from './modules/time-adjustments/time-adjustments.router'
import hourBankRouter from './modules/hour-bank/hour-bank.router'

const app = express()
// Railway fica na frente como proxy: sem isso todos os celulares aparecem com o mesmo IP
// e dividem a mesma cota do rate limit (pode bloquear batida de ponto de todo mundo)
app.set('trust proxy', 1)

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim())
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
app.use(globalLimiter)

app.use(express.json({ limit: '15mb' }))
app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)))

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/time-entries', timeEntriesRouter)
app.use('/api/gps-logs', gpsLogsRouter)
app.use('/api/work-days', workDaysRouter)
app.use('/api/gps-ext', gpsExtRouter)
app.use('/api/payslips', payslipsRouter)
app.use('/api/absences', absencesRouter)
app.use('/api/vacations', vacationsRouter)
app.use('/api/day-offs', dayOffsRouter)
app.use('/api/time-adjustments', timeAdjustmentsRouter)
app.use('/api/hour-bank', hourBankRouter)

app.use(errorHandler)

export default app
