import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getTrailByDate, getTodayTrail } from './gps-logs.service'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import { prisma } from '../../config/database'

const router = Router()
router.use(requireAuth)

const bulkSchema = z.array(z.object({
  latitude:  z.number(),
  longitude: z.number(),
  accuracy:  z.number().optional(),
  speed:     z.number().optional(),
  timestamp: z.string().datetime(),
})).max(5000)

// sync offline: recebe lote de coordenadas com timestamps reais
router.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthRequest).userId
    const logs = bulkSchema.parse(req.body)

    await prisma.gpsLog.createMany({
      data: logs.map(l => ({
        userId,
        latitude:  l.latitude,
        longitude: l.longitude,
        accuracy:  l.accuracy,
        speed:     l.speed,
        timestamp: new Date(l.timestamp),
      })),
      skipDuplicates: true,
    })

    res.json({ synced: logs.length })
  } catch (e) { next(e) }
})

router.get('/trail/today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getTodayTrail((req as AuthRequest).userId))
  } catch (e) { next(e) }
})

router.get('/trail/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dateStr = String(Array.isArray(req.query.date) ? req.query.date[0] : (req.query.date || ''))
    if (dateStr) {
      res.json(await getTrailByDate(req.params.userId as string, dateStr))
    } else {
      res.json(await getTodayTrail(req.params.userId as string))
    }
  } catch (e) { next(e) }
})

export default router
