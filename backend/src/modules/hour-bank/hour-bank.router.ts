import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import { getMyHourBank, getUserHourBank, getTeamHourBank } from './hour-bank.service'

const router = Router()
router.use(requireAuth)

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string }
    res.json(await getMyHourBank((req as AuthRequest).userId, dateFrom, dateTo))
  } catch (e) { next(e) }
})

router.get('/user/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string }
    res.json(await getUserHourBank(req.params.userId as string, dateFrom, dateTo))
  } catch (e) { next(e) }
})

router.get('/team', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo, unit } = req.query as { dateFrom?: string; dateTo?: string; unit?: string }
    res.json(await getTeamHourBank(dateFrom, dateTo, unit))
  } catch (e) { next(e) }
})

export default router
