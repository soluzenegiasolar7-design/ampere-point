import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'

const router = Router()
router.use(requireAuth)

router.get('/export', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10))
    const [y, m, d] = dateStr.split('-').map(Number)
    const dateOnly = new Date(y, m - 1, d, 0, 0, 0, 0)
    const dateEnd  = new Date(y, m - 1, d, 23, 59, 59, 999)

    const days = await prisma.workDay.findMany({
      where: { date: { gte: dateOnly, lte: dateEnd } },
      include: { user: { select: { id: true, name: true, unit: true } } },
      orderBy: { user: { name: 'asc' } },
    })

    const allEntries = await prisma.timeEntry.findMany({
      where: { userId: { in: days.map(d => d.userId) }, timestamp: { gte: dateOnly, lte: dateEnd } },
      orderBy: { timestamp: 'asc' },
    })

    const entriesByUser: Record<string, Record<string, Date>> = {}
    for (const e of allEntries) {
      if (!entriesByUser[e.userId]) entriesByUser[e.userId] = {}
      entriesByUser[e.userId][e.type] = e.timestamp
    }

    const fmtTime = (ts?: Date) => ts
      ? ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' })
      : ''
    const fmtMin = (mins: number) => `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`

    const header = 'Nome,Unidade,Status,KM Percorrido,Tempo Trabalhado,Entrada,Saída Almoço,Retorno Almoço,Saída'
    const rows = days.map(day => {
      const bt = entriesByUser[day.userId] || {}
      return [
        day.user.name,
        day.user.unit || '',
        day.status,
        day.totalKm.toFixed(2),
        fmtMin(day.totalMinutes),
        fmtTime(bt['ENTRADA']),
        fmtTime(bt['SAIDA_ALMOCO']),
        fmtTime(bt['RETORNO_ALMOCO']),
        fmtTime(bt['SAIDA']),
      ].map(v => esc(String(v))).join(',')
    })

    const csv = '﻿' + [header, ...rows].join('\r\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="ponto-${dateStr}.csv"`)
    res.send(csv)
  } catch (e) { next(e) }
})

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
