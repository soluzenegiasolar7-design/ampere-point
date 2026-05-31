import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getTodayTrail } from './gps-logs.service'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'

const router = Router()
router.use(requireAuth)

router.get('/trail/today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getTodayTrail((req as AuthRequest).userId))
  } catch (e) { next(e) }
})

router.get('/trail/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getTodayTrail(req.params.userId as string))
  } catch (e) { next(e) }
})

export default router
