import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import { createVacation, listMyVacations, listAllVacations, listUserVacations, reviewVacation } from './vacations.service'

const router = Router()
router.use(requireAuth)

const createSchema = z.object({
  userId: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string().optional(),
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req as AuthRequest
    const data = createSchema.parse(req.body)
    const targetUserId = ['ADMIN', 'MANAGER'].includes(auth.userRole) && data.userId ? data.userId : auth.userId
    res.status(201).json(await createVacation({
      userId: targetUserId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      notes: data.notes,
    }))
  } catch (e) { next(e) }
})

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listMyVacations((req as AuthRequest).userId))
  } catch (e) { next(e) }
})

router.get('/', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listAllVacations(req.query.status as string | undefined))
  } catch (e) { next(e) }
})

router.get('/user/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listUserVacations(req.params.userId as string))
  } catch (e) { next(e) }
})

router.patch('/:id/review', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).parse(req.body)
    res.json(await reviewVacation(req.params.id as string, (req as AuthRequest).userId, status as any))
  } catch (e) { next(e) }
})

export default router
