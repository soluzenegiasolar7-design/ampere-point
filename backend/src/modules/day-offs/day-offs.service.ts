import { prisma } from '../../config/database'
import { RequestStatus } from '@prisma/client'
import { AppError } from '../../shared/errors/AppError'

export async function createDayOff(data: { userId: string; date: Date; reason?: string }) {
  return prisma.dayOff.upsert({
    where: { userId_date: { userId: data.userId, date: data.date } },
    create: data,
    update: { reason: data.reason, status: 'PENDING' },
    select: { id: true, userId: true, date: true, reason: true, status: true, createdAt: true },
  })
}

export async function listMyDayOffs(userId: string) {
  return prisma.dayOff.findMany({
    where: { userId },
    select: { id: true, date: true, reason: true, status: true, reviewedAt: true, createdAt: true },
    orderBy: { date: 'desc' },
  })
}

export async function listAllDayOffs(status?: string) {
  return prisma.dayOff.findMany({
    where: status ? { status: status as RequestStatus } : {},
    include: { user: { select: { id: true, name: true, unit: true } } },
    orderBy: { date: 'desc' },
  })
}

export async function listUserDayOffs(userId: string) {
  return prisma.dayOff.findMany({
    where: { userId },
    select: { id: true, date: true, reason: true, status: true, reviewedAt: true, createdAt: true },
    orderBy: { date: 'desc' },
  })
}

export async function reviewDayOff(id: string, reviewedBy: string, status: RequestStatus) {
  const dayOff = await prisma.dayOff.findUnique({ where: { id } })
  if (!dayOff) throw new AppError('Folga não encontrada', 404)
  return prisma.dayOff.update({
    where: { id },
    data: { status, reviewedBy, reviewedAt: new Date() },
    select: { id: true, status: true, reviewedAt: true },
  })
}
