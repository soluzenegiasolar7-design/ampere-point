import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'

const router = Router()
router.use(requireAuth)

router.get('/today', requireRole('ADMIN', 'MANAGER'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const dateOnly = new Date(); dateOnly.setHours(0, 0, 0, 0)
    const days = await prisma.workDay.findMany({
      where: { date: dateOnly },
      include: { user: { select: { id: true, name: true, unit: true } } },
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
    })
    res.json(days)
  } catch (e) { next(e) }
})

export default router
