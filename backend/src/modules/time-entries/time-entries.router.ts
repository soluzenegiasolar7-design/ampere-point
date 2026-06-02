import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { punch, listTodayEntries, listAllTodayEntries, listEntriesByDate, nextPunchType } from './time-entries.service'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import multer from 'multer'
import { getIo } from '../../socket/io'
import { prisma } from '../../config/database'

// foto em memória → salva no banco como bytes
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const router = Router()
router.use(requireAuth)

const punchSchema = z.object({
  type: z.enum(['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA']),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  accuracy: z.coerce.number().optional(),
  deviceInfo: z.string().optional(),
})

router.post('/', upload.single('photo'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = punchSchema.parse(req.body)
    const ipAddress = req.ip
    const userId = (req as AuthRequest).userId

    const entry = await punch(userId, { ...data, ipAddress })

    // salva foto no banco se enviada
    if (req.file?.buffer) {
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          photoData: req.file.buffer as unknown as Uint8Array<ArrayBuffer>,
          photoUrl: `/api/time-entries/photo/${entry.id}`,
        },
      })
      entry.photoUrl = `/api/time-entries/photo/${entry.id}`
    }

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

// serve foto direto do banco
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
    res.json(await listEntriesByDate(req.params.userId as string, date || new Date().toISOString()))
  } catch (e) { next(e) }
})

export default router
