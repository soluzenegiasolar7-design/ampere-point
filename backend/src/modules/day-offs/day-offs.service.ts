import { prisma } from '../../config/database'
import { RequestStatus } from '@prisma/client'
import { AppError } from '../../shared/errors/AppError'
import { syncDayOffDebit } from '../hour-bank/hour-bank.service'

// Quando o gestor lança a folga ela já entra aprovada e debita do banco de horas na hora.
// Quando o próprio funcionário solicita, fica pendente até o gestor aprovar.
export async function createDayOff(data: { userId: string; date: Date; reason?: string; approvedBy?: string }) {
  const status: RequestStatus = data.approvedBy ? 'APPROVED' : 'PENDING'
  const review = data.approvedBy
    ? { reviewedBy: data.approvedBy, reviewedAt: new Date() }
    : { reviewedBy: null, reviewedAt: null }
  const dayOff = await prisma.dayOff.upsert({
    where: { userId_date: { userId: data.userId, date: data.date } },
    create: { userId: data.userId, date: data.date, reason: data.reason, status, ...review },
    update: { reason: data.reason, status, ...review },
    select: { id: true, userId: true, date: true, reason: true, status: true, createdAt: true },
  })
  await syncDayOffDebit(dayOff.id, dayOff.userId, dayOff.date, status === 'APPROVED', data.approvedBy ?? data.userId)
  return dayOff
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
  const updated = await prisma.dayOff.update({
    where: { id },
    data: { status, reviewedBy, reviewedAt: new Date() },
    select: { id: true, status: true, reviewedAt: true },
  })
  await syncDayOffDebit(dayOff.id, dayOff.userId, dayOff.date, status === 'APPROVED', reviewedBy)
  return updated
}
