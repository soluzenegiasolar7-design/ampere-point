import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import { createDayOff, listMyDayOffs, listAllDayOffs, listUserDayOffs, reviewDayOff } from './day-offs.service'

const router = Router()
router.use(requireAuth)

const createSchema = z.object({
  userId: z.string().optional(),
  date: z.string(),
  reason: z.string().optional(),
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req as AuthRequest
    const data = createSchema.parse(req.body)
    const targetUserId = ['ADMIN', 'MANAGER'].includes(auth.userRole) && data.userId ? data.userId : auth.userId
    res.status(201).json(await createDayOff({ userId: targetUserId, date: new Date(data.date), reason: data.reason }))
  } catch (e) { next(e) }
})

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listMyDayOffs((req as AuthRequest).userId))
  } catch (e) { next(e) }
})

router.get('/', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listAllDayOffs(req.query.status as string | undefined))
  } catch (e) { next(e) }
})

router.get('/user/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listUserDayOffs(req.params.userId as string))
  } catch (e) { next(e) }
})

router.patch('/:id/review', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).parse(req.body)
    res.json(await reviewDayOff(req.params.id as string, (req as AuthRequest).userId, status as any))
  } catch (e) { next(e) }
})

export default router
