import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import {
  getMyHourBank, getUserHourBank, getTeamHourBank,
  createManualAdjustment, listEntries, deleteManualEntry,
} from './hour-bank.service'

const router = Router()
router.use(requireAuth)

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string }
    res.json(await getMyHourBank((req as AuthRequest).userId, dateFrom, dateTo))
  } catch (e) { next(e) }
})

router.get('/my/entries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string }
    res.json(await listEntries((req as AuthRequest).userId, dateFrom, dateTo))
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

router.get('/entries', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, dateFrom, dateTo } = req.query as { userId?: string; dateFrom?: string; dateTo?: string }
    if (!userId) return res.json([])
    res.json(await listEntries(userId, dateFrom, dateTo))
  } catch (e) { next(e) }
})

const adjustmentSchema = z.object({
  userId: z.string(),
  minutes: z.number().int(),
  date: z.string(),
  reason: z.string().min(5),
})

router.post('/adjustments', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = adjustmentSchema.parse(req.body)
    res.status(201).json(await createManualAdjustment({
      userId: data.userId,
      minutes: data.minutes,
      date: new Date(data.date),
      reason: data.reason,
      createdBy: (req as AuthRequest).userId,
    }))
  } catch (e) { next(e) }
})

router.delete('/entries/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteManualEntry(req.params.id as string)
    res.status(204).end()
  } catch (e) { next(e) }
})

export default router
