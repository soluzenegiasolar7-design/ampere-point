import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { punch, listTodayEntries, listAllTodayEntries, listAllEntriesByDate, listEntriesByDate, listEntriesByRange, nextPunchType, recalcTotalMinutes, deleteEntry, updateEntryTimestamp } from './time-entries.service'
import { requireAuth, requireAuthPhoto, requireRole, AuthRequest } from '../auth/auth.middleware'
import multer from 'multer'
import { getIo } from '../../socket/io'
import { prisma } from '../../config/database'

// upload.single — mantém o comportamento original que funcionava para selfie
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const router = Router()

// rotas de foto ficam ANTES do requireAuth — img tags não enviam Authorization header
router.get('/photo/:id', requireAuthPhoto, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: req.params.id as string },
      select: { photoData: true },
    })
    if (!entry?.photoData) { res.status(404).end(); return }
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(entry.photoData)
  } catch (e) { next(e) }
})

router.get('/odometer-photo/:id', requireAuthPhoto, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: req.params.id as string },
      select: { odometerPhotoData: true },
    })
    if (!entry?.odometerPhotoData) { res.status(404).end(); return }
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(entry.odometerPhotoData)
  } catch (e) { next(e) }
})

router.use(requireAuth)

const punchSchema = z.object({
  type:       z.enum(['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA']),
  latitude:   z.coerce.number(),
  longitude:  z.coerce.number(),
  accuracy:   z.coerce.number().optional(),
  deviceInfo: z.string().optional(),
})

// POST /api/time-entries — bate ponto com selfie
router.post('/', upload.single('photo'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = punchSchema.parse(req.body)
    const userId = (req as AuthRequest).userId

    const entry = await punch(userId, { ...data, ipAddress: req.ip })

    if (req.file?.buffer) {
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          photoData: req.file.buffer as unknown as Uint8Array<ArrayBuffer>,
          photoUrl:  `/api/time-entries/photo/${entry.id}`,
        },
      })
      entry.photoUrl = `/api/time-entries/photo/${entry.id}`
    }

    recalcTotalMinutes(userId).catch(() => {})

    const io = getIo()
    if (io) {
      io.to('tracking:room').emit('gps:user_location', {
        userId,
        latitude:  data.latitude,
        longitude: data.longitude,
        accuracy:  data.accuracy,
        timestamp: new Date(),
      })
      io.to('tracking:room').emit('punch:new', { userId, type: data.type })
    }

    res.status(201).json(entry)
  } catch (e) { next(e) }
})

// PATCH /api/time-entries/:id/odometer — registra km + foto do tacômetro (chamada separada na SAIDA)
router.patch('/:id/odometer', upload.single('odometerPhoto'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthRequest).userId
    const { id } = req.params as { id: string }
    const odometerKm = req.body.odometerKm != null ? parseFloat(req.body.odometerKm) : undefined

    const entry = await prisma.timeEntry.findUnique({ where: { id }, select: { id: true, userId: true } })
    if (!entry || entry.userId !== userId) { res.status(404).json({ message: 'Ponto não encontrado' }); return }

    await prisma.timeEntry.update({
      where: { id },
      data: {
        ...(odometerKm != null && { odometerKm }),
        ...(req.file?.buffer && {
          odometerPhotoData: req.file.buffer as unknown as Uint8Array<ArrayBuffer>,
          odometerPhotoUrl:  `/api/time-entries/odometer-photo/${id}`,
        }),
      },
    })

    res.json({ ok: true })
  } catch (e) { next(e) }
})

router.get('/today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listTodayEntries((req as AuthRequest).userId))
  } catch (e) { next(e) }
})

router.get('/next', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ next: await nextPunchType((req as AuthRequest).userId) })
  } catch (e) { next(e) }
})

router.get('/all/today', requireRole('ADMIN', 'MANAGER'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listAllTodayEntries())
  } catch (e) { next(e) }
})

router.get('/all', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = String(Array.isArray(req.query.date) ? req.query.date[0] : (req.query.date || new Date().toISOString()))
    const entries = await listAllEntriesByDate(date)
    res.json(entries.map((e: any) => ({ ...e, photoData: undefined, odometerPhotoData: undefined })))
  } catch (e) { next(e) }
})

router.get('/user/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid      = req.params.userId as string
    const dateFrom = String(Array.isArray(req.query.dateFrom) ? req.query.dateFrom[0] : (req.query.dateFrom || ''))
    const dateTo   = String(Array.isArray(req.query.dateTo)   ? req.query.dateTo[0]   : (req.query.dateTo   || ''))
    const date     = String(Array.isArray(req.query.date)     ? req.query.date[0]     : (req.query.date     || ''))
    const entries = dateFrom && dateTo
      ? await listEntriesByRange(uid, dateFrom, dateTo)
      : await listEntriesByDate(uid, date || new Date().toISOString())
    res.json(entries.map((e: any) => ({ ...e, photoData: undefined, odometerPhotoData: undefined })))
  } catch (e) { next(e) }
})

// ── Correção direta (ADMIN/MANAGER) ──
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await deleteEntry(req.params.id as string))
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timestamp } = z.object({ timestamp: z.string() }).parse(req.body)
    res.json(await updateEntryTimestamp(req.params.id as string, timestamp))
  } catch (e) { next(e) }
})

export default router
