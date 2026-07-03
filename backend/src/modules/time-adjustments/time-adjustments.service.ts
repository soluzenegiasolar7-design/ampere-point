import { prisma } from '../../config/database'
import { PunchType, RequestStatus } from '@prisma/client'
import { AppError } from '../../shared/errors/AppError'
import { brtRangeForCalendarDate, recalcTotalMinutes } from '../time-entries/time-entries.service'

export async function createAdjustment(data: {
  userId: string; date: Date; punchType: PunchType; requestedTime: Date; reason: string
}) {
  return prisma.timeAdjustment.create({
    data,
    select: { id: true, userId: true, date: true, punchType: true, requestedTime: true, reason: true, status: true, createdAt: true },
  })
}

export async function listMyAdjustments(userId: string) {
  return prisma.timeAdjustment.findMany({
    where: { userId },
    select: { id: true, date: true, punchType: true, requestedTime: true, reason: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function listAllAdjustments(status?: string) {
  return prisma.timeAdjustment.findMany({
    where: status ? { status: status as RequestStatus } : {},
    include: { user: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function reviewAdjustment(id: string, reviewedBy: string, status: RequestStatus, reviewNote?: string) {
  const adj = await prisma.timeAdjustment.findUnique({ where: { id } })
  if (!adj) throw new AppError('Solicitação não encontrada', 404)

  if (status === 'APPROVED') {
    const { start, end } = brtRangeForCalendarDate(adj.date)
    const entry = await prisma.timeEntry.findFirst({
      where: { userId: adj.userId, type: adj.punchType, timestamp: { gte: start, lte: end } },
    })
    if (entry) {
      await prisma.timeEntry.update({ where: { id: entry.id }, data: { timestamp: adj.requestedTime } })
    } else {
      // funcionário esqueceu de bater esse ponto — cria um novo, sem GPS real
      // (foi aprovado manualmente pelo gestor, não veio de um dispositivo no local)
      await prisma.timeEntry.create({
        data: {
          userId: adj.userId,
          type: adj.punchType,
          timestamp: adj.requestedTime,
          address: 'Ponto criado manualmente via ajuste aprovado',
        },
      })
    }
    await recalcTotalMinutes(adj.userId, start)
  }

  return prisma.timeAdjustment.update({
    where: { id },
    data: { status, reviewedBy, reviewedAt: new Date(), reviewNote },
    select: { id: true, status: true, reviewedAt: true, reviewNote: true },
  })
}
