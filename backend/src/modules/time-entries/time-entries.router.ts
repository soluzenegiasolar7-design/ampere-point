import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { punch, listTodayEntries, listAllTodayEntries, listEntriesByDate, nextPunchType, recalcTotalMinutes } from './time-entries.service'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import multer from 'multer'
import { getIo } from '../../socket/io'
import { prisma } from '../../config/database'

// fotos em memória → salva no banco como bytes
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const uploadFields = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'odometerPhoto', maxCount: 1 },
])

const router = Router()
router.use(requireAuth)

const punchSchema = z.object({
  type: z.enum(['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA']),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  accuracy: z.coerce.number().optional(),
  deviceInfo: z.string().optional(),
  odometerKm: z.coerce.number().optional(),
})

router.post('/', uploadFields, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = punchSchema.parse(req.body)
    const ipAddress = req.ip
    const userId = (req as AuthRequest).userId

    const entry = await punch(userId, { ...data, ipAddress })

    const files = req.files as Record<string, Express.Multer.File[]> | undefined
    const selfieFile  = files?.['photo']?.[0]
    const odometerFile = files?.['odometerPhoto']?.[0]

    if (selfieFile?.buffer || odometerFile?.buffer || data.odometerKm != null) {
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          ...(selfieFile?.buffer && {
            photoData: selfieFile.buffer as unknown as Uint8Array<ArrayBuffer>,
            photoUrl:  `/api/time-entries/photo/${entry.id}`,
          }),
          ...(odometerFile?.buffer && {
            odometerPhotoData: odometerFile.buffer as unknown as Uint8Array<ArrayBuffer>,
            odometerPhotoUrl:  `/api/time-entries/odometer-photo/${entry.id}`,
          }),
          ...(data.odometerKm != null && { odometerKm: data.odometerKm }),
        },
      })
      if (selfieFile?.buffer)   entry.photoUrl = `/api/time-entries/photo/${entry.id}`
      if (data.odometerKm != null) (entry as any).odometerKm = data.odometerKm
    }

    // atualiza totalMinutes do dia
    recalcTotalMinutes(userId, new Date()).catch(() => {})

    // emite localização imediata para gestores
    const io = getIo()
    if (io) {
      io.to('tracking:room').emit('gps:user_location', {
        userId,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy,
        timestamp: new Date(),
      })
    }

    res.status(201).json(entry)
  } catch (e) { next(e) }
})

// serve selfie do banco
router.get('/photo/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: req.params.id as string },
      select: { photoData: true },
    })
    if (!entry?.photoData) { res.status(404).json({ message: 'Foto não encontrada' }); return }
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=31536000')
    res.send(entry.photoData)
  } catch (e) { next(e) }
})

// serve foto do tacômetro
router.get('/odometer-photo/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id: req.params.id as string },
      select: { odometerPhotoData: true },
    })
    if (!entry?.odometerPhotoData) { res.status(404).json({ message: 'Foto não encontrada' }); return }
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=31536000')
    res.send(entry.odometerPhotoData)
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

router.get('/user/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = String(Array.isArray(req.query.date) ? req.query.date[0] : (req.query.date || ''))
    const entries = await listEntriesByDate(req.params.userId as string, date || new Date().toISOString())
    res.json(entries.map((e: any) => ({
      ...e,
      photoData: undefined,
      odometerPhotoData: undefined,
    })))
  } catch (e) { next(e) }
})

export default router
