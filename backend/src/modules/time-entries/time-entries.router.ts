import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { punch, listTodayEntries, listAllTodayEntries, listEntriesByDate, nextPunchType } from './time-entries.service'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import multer from 'multer'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { env } from '../../config/env'

const storage = multer.diskStorage({
  destination: env.UPLOAD_DIR,
  filename: (_req, file, cb) => cb(null, uuid() + path.extname(file.originalname)),
})
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

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
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined
    const ipAddress = req.ip
    const entry = await punch((req as AuthRequest).userId, { ...data, photoUrl, ipAddress })
    res.status(201).json(entry)
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
