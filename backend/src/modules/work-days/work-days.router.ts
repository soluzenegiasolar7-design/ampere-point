import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAuth, requireAuthPhoto, requireRole, AuthRequest } from '../auth/auth.middleware'
import { brtTodayRange } from '../time-entries/time-entries.service'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const router = Router()

type Phase = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida'

const PHASE_FIELDS = {
  entrada:        { km: 'odometerKmEntrada',       photoData: 'odometerPhotoDataEntrada',       photoUrl: 'odometerPhotoUrlEntrada',       urlPath: '/entrada' },
  saida_almoco:   { km: 'odometerKmSaidaAlmoco',    photoData: 'odometerPhotoDataSaidaAlmoco',    photoUrl: 'odometerPhotoUrlSaidaAlmoco',    urlPath: '/saida_almoco' },
  retorno_almoco: { km: 'odometerKmRetornoAlmoco',  photoData: 'odometerPhotoDataRetornoAlmoco',  photoUrl: 'odometerPhotoUrlRetornoAlmoco',  urlPath: '/retorno_almoco' },
  saida:          { km: 'odometerKm',               photoData: 'odometerPhotoData',               photoUrl: 'odometerPhotoUrl',               urlPath: '' },
} as const

function resolvePhase(value: unknown): Phase {
  return value === 'entrada' || value === 'saida_almoco' || value === 'retorno_almoco' ? value : 'saida'
}

// foto do odômetro do WorkDay — pública (img tag não envia auth header)
// a fase vai no path, nunca em query string, pra não colidir com ?token= do photoUrl()
async function sendOdometerPhoto(req: Request, res: Response, next: NextFunction, phase: Phase) {
  try {
    const field = PHASE_FIELDS[phase].photoData
    const wd = await prisma.workDay.findUnique({
      where: { id: req.params.id as string },
      select: { [field]: true },
    })
    const photo = (wd as any)?.[field]
    if (!photo) { res.status(404).end(); return }
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(photo)
  } catch (e) { next(e) }
}
router.get('/odometer-photo/:id', requireAuthPhoto, (req, res, next) => sendOdometerPhoto(req, res, next, 'saida'))
router.get('/odometer-photo/:id/entrada', requireAuthPhoto, (req, res, next) => sendOdometerPhoto(req, res, next, 'entrada'))
router.get('/odometer-photo/:id/saida_almoco', requireAuthPhoto, (req, res, next) => sendOdometerPhoto(req, res, next, 'saida_almoco'))
router.get('/odometer-photo/:id/retorno_almoco', requireAuthPhoto, (req, res, next) => sendOdometerPhoto(req, res, next, 'retorno_almoco'))

router.use(requireAuth)

const fmtTime = (ts?: Date) => ts
  ? ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' })
  : ''
const fmtMin = (mins: number) => `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
const CSV_HEADER = 'Nome,Unidade,Data,Status,KM Percorrido,KM Tacômetro,Tempo Trabalhado,Horas Extras,Entrada,Saída Almoço,Retorno Almoço,Saída'

async function buildCsvRows(dateStart: Date, dateEnd: Date) {
  const days = await prisma.workDay.findMany({
    where: { date: { gte: dateStart, lte: dateEnd } },
    include: { user: { select: { id: true, name: true, unit: true } } },
    orderBy: [{ user: { name: 'asc' } }, { date: 'asc' }],
  })

  const allEntries = await prisma.timeEntry.findMany({
    where: { userId: { in: days.map(d => d.userId) }, timestamp: { gte: dateStart, lte: dateEnd } },
    select: { userId: true, type: true, timestamp: true, odometerKm: true },
    orderBy: { timestamp: 'asc' },
  })

  const entriesByUserDate: Record<string, Record<string, { time: Date; odometerKm?: number | null }>> = {}
  for (const e of allEntries) {
    const dateKey = e.timestamp.toISOString().slice(0, 10)
    const key = `${e.userId}__${dateKey}`
    if (!entriesByUserDate[key]) entriesByUserDate[key] = {}
    entriesByUserDate[key][e.type] = { time: e.timestamp, odometerKm: e.type === 'SAIDA' ? e.odometerKm : undefined }
  }

  const STANDARD_MINUTES = 8 * 60
  return days.map(day => {
    const dateKey = day.date.toISOString().slice(0, 10)
    const bt = entriesByUserDate[`${day.userId}__${dateKey}`] || {}
    const extraMinutes = Math.max(0, day.totalMinutes - STANDARD_MINUTES)
    return [
      day.user.name,
      day.user.unit || '',
      dateKey,
      day.status,
      day.totalKm.toFixed(2),
      bt['SAIDA']?.odometerKm != null ? bt['SAIDA'].odometerKm.toFixed(1) : '',
      fmtMin(day.totalMinutes),
      extraMinutes > 0 ? fmtMin(extraMinutes) : '',
      fmtTime(bt['ENTRADA']?.time),
      fmtTime(bt['SAIDA_ALMOCO']?.time),
      fmtTime(bt['RETORNO_ALMOCO']?.time),
      fmtTime(bt['SAIDA']?.time),
    ].map(v => esc(String(v))).join(',')
  })
}

// exportação diária (mantida para compatibilidade)
router.get('/export', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10))
    const [y, m, d] = dateStr.split('-').map(Number)
    const dateStart = new Date(y, m - 1, d, 0, 0, 0, 0)
    const dateEnd   = new Date(y, m - 1, d, 23, 59, 59, 999)

    const rows = await buildCsvRows(dateStart, dateEnd)
    const csv = '﻿' + [CSV_HEADER, ...rows].join('\r\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="ponto-${dateStr}.csv"`)
    res.send(csv)
  } catch (e) { next(e) }
})

// exportação mensal
router.get('/export-monthly', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monthStr = String(req.query.month || new Date().toISOString().slice(0, 7))
    const [y, m] = monthStr.split('-').map(Number)
    const dateStart = new Date(y, m - 1, 1, 0, 0, 0, 0)
    const dateEnd   = new Date(y, m, 0, 23, 59, 59, 999) // último dia do mês

    const rows = await buildCsvRows(dateStart, dateEnd)
    const csv = '﻿' + [CSV_HEADER, ...rows].join('\r\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="ponto-${monthStr}.csv"`)
    res.send(csv)
  } catch (e) { next(e) }
})

router.get('/user/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId as string
    const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10))
    const [y, m, d] = dateStr.split('-').map(Number)
    const dateOnly = new Date(y, m - 1, d, 0, 0, 0, 0)
    const wd = await prisma.workDay.findUnique({
      where: { userId_date: { userId, date: dateOnly } },
      select: {
        id: true, date: true, totalKm: true, totalMinutes: true, status: true,
        odometerKm: true, odometerPhotoUrl: true,
        odometerKmEntrada: true, odometerPhotoUrlEntrada: true,
      },
    })
    res.json(wd ?? null)
  } catch (e) { next(e) }
})

router.get('/today', requireRole('ADMIN', 'MANAGER'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateKey: dateOnly } = brtTodayRange()
    const days = await prisma.workDay.findMany({
      where: { date: { gte: dateOnly, lt: new Date(dateOnly.getTime() + 86400000) } },
      select: {
        id: true, userId: true, date: true, totalKm: true, totalMinutes: true,
        status: true, odometerKm: true, odometerPhotoUrl: true,
        odometerKmEntrada: true, odometerPhotoUrlEntrada: true,
        user: { select: { id: true, name: true, unit: true } },
      },
    })
    res.json(days)
  } catch (e) { next(e) }
})

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthRequest).userId
    const days = await prisma.workDay.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 30,
      select: {
        id: true, date: true, totalKm: true, totalMinutes: true,
        status: true, odometerKm: true, odometerPhotoUrl: true,
        odometerKmEntrada: true, odometerPhotoUrlEntrada: true,
        odometerKmSaidaAlmoco: true, odometerPhotoUrlSaidaAlmoco: true,
        odometerKmRetornoAlmoco: true, odometerPhotoUrlRetornoAlmoco: true,
      },
    })
    res.json(days)
  } catch (e) { next(e) }
})

// registra km e foto do odômetro para o dia de hoje, em qualquer uma das 4 fases do ponto
router.patch('/today/odometer', upload.single('odometerPhoto'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthRequest).userId
    const phase = resolvePhase(req.body.phase)
    const { km: kmField, photoData: photoField, photoUrl: urlField, urlPath } = PHASE_FIELDS[phase]
    const odometerKm = req.body.odometerKm != null ? parseFloat(req.body.odometerKm) : undefined
    if (!odometerKm && !req.file) { res.status(400).json({ message: 'Informe km ou foto' }); return }

    const { dateKey: dateOnly } = brtTodayRange()
    const wd = await prisma.workDay.upsert({
      where: { userId_date: { userId, date: dateOnly } },
      update: {
        ...(odometerKm != null && { [kmField]: odometerKm }),
        ...(req.file?.buffer && {
          [photoField]: req.file.buffer as unknown as Uint8Array<ArrayBuffer>,
        }),
      },
      create: { userId, date: dateOnly, [kmField]: odometerKm, status: 'PENDENTE' },
      select: { id: true, [kmField]: true } as any,
    })

    // define a URL após ter o ID
    if (req.file?.buffer) {
      await prisma.workDay.update({
        where: { id: wd.id },
        data: { [urlField]: `/api/work-days/odometer-photo/${wd.id}${urlPath}` },
      })
    }

    res.json({ ok: true, odometerKm: (wd as any)[kmField] })
  } catch (e) { next(e) }
})

// resumo KM de um funcionário em um período
router.get('/summary/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid      = req.params.userId as string
    const dateFrom = String(Array.isArray(req.query.dateFrom) ? req.query.dateFrom[0] : (req.query.dateFrom || ''))
    const dateTo   = String(Array.isArray(req.query.dateTo)   ? req.query.dateTo[0]   : (req.query.dateTo   || ''))
    if (!dateFrom || !dateTo) { res.status(400).json({ error: 'dateFrom e dateTo obrigatórios' }); return }

    const start = new Date(dateFrom); start.setHours(0, 0, 0, 0)
    const end   = new Date(dateTo);   end.setHours(23, 59, 59, 999)

    const days = await prisma.workDay.findMany({
      where: { userId: uid, date: { gte: start, lte: end } },
      select: {
        totalKm: true, totalMinutes: true, date: true,
        odometerKm: true, odometerPhotoUrl: true,
        odometerKmEntrada: true, odometerPhotoUrlEntrada: true,
      },
      orderBy: { date: 'asc' },
    })

    // deslocamento real do dia = odômetro da saída - odômetro da entrada (só quando os dois existem)
    const displacement = (d: typeof days[number]) =>
      d.odometerKmEntrada != null && d.odometerKm != null
        ? Math.max(0, d.odometerKm - d.odometerKmEntrada)
        : null

    // só contabiliza dias onde o funcionário efetivamente trabalhou (totalMinutes > 0)
    const workedDays = days.filter(d => (d.totalMinutes ?? 0) > 0)

    const gpsKm      = workedDays.reduce((s, d) => s + (d.totalKm ?? 0), 0)
    const odometerKm = workedDays.reduce((s, d) => s + (displacement(d) ?? 0), 0)
    const totalMin   = workedDays.reduce((s, d) => s + (d.totalMinutes ?? 0), 0)
    const workDays   = workedDays.length

    const dailyOdometer = days.map(d => ({
      date: d.date,
      odometerKmEntrada: d.odometerKmEntrada,
      odometerKm: d.odometerKm,
      odometerPhotoUrlEntrada: d.odometerPhotoUrlEntrada,
      odometerPhotoUrl: d.odometerPhotoUrl,
      displacementKm: displacement(d),
    }))

    res.json({ gpsKm, odometerKm, totalMinutes: totalMin, workDays, dailyOdometer })
  } catch (e) { next(e) }
})

export default router
