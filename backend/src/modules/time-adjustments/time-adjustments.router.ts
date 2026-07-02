import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import { createAdjustment, listMyAdjustments, listAllAdjustments, reviewAdjustment } from './time-adjustments.service'

const router = Router()
router.use(requireAuth)

const createSchema = z.object({
  date: z.string(),
  punchType: z.enum(['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA']),
  requestedTime: z.string(),
  reason: z.string().min(10),
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSchema.parse(req.body)
    res.status(201).json(await createAdjustment({
      userId: (req as AuthRequest).userId,
      date: new Date(data.date),
      punchType: data.punchType as any,
      requestedTime: new Date(data.requestedTime),
      reason: data.reason,
    }))
  } catch (e) { next(e) }
})

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listMyAdjustments((req as AuthRequest).userId))
  } catch (e) { next(e) }
})

router.get('/', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listAllAdjustments(req.query.status as string | undefined))
  } catch (e) { next(e) }
})

router.patch('/:id/review', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, reviewNote } = z.object({
      status: z.enum(['APPROVED', 'REJECTED']),
      reviewNote: z.string().optional(),
    }).parse(req.body)
    res.json(await reviewAdjustment(req.params.id as string, (req as AuthRequest).userId, status as any, reviewNote))
  } catch (e) { next(e) }
})

export default router
