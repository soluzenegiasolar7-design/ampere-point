import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import { createAdjustment, listMyAdjustments, listAllAdjustments, reviewAdjustment } from './time-adjustments.service'
import { AppError } from '../../shared/errors/AppError'

const router = Router()
router.use(requireAuth)

const createSchema = z.object({
  date: z.string(),
  punchType: z.enum(['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA']),
  requestedTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:MM'),
  reason: z.string().min(10),
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSchema.parse(req.body)
    // requestedTime vem só como "HH:MM" (input type="time") — combina com a data,
    // no fuso BRT (-03:00), pra virar um instante real
    const requestedTime = new Date(`${data.date}T${data.requestedTime}:00-03:00`)
    if (isNaN(requestedTime.getTime())) throw new AppError('Data ou horário inválido', 400)
    res.status(201).json(await createAdjustment({
      userId: (req as AuthRequest).userId,
      date: new Date(data.date),
      punchType: data.punchType as any,
      requestedTime,
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
