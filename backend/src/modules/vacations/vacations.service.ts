import { prisma } from '../../config/database'
import { RequestStatus } from '@prisma/client'
import { AppError } from '../../shared/errors/AppError'

export async function createVacation(data: { userId: string; startDate: Date; endDate: Date; notes?: string }) {
  if (data.endDate <= data.startDate) throw new AppError('Data final deve ser após a data inicial', 400)
  return prisma.vacation.create({
    data,
    select: { id: true, userId: true, startDate: true, endDate: true, notes: true, status: true, createdAt: true },
  })
}

export async function listMyVacations(userId: string) {
  return prisma.vacation.findMany({
    where: { userId },
    select: { id: true, startDate: true, endDate: true, notes: true, status: true, reviewedAt: true, createdAt: true },
    orderBy: { startDate: 'desc' },
  })
}

export async function listAllVacations(status?: string) {
  return prisma.vacation.findMany({
    where: status ? { status: status as RequestStatus } : {},
    include: { user: { select: { id: true, name: true, unit: true } } },
    orderBy: { startDate: 'desc' },
  })
}

export async function listUserVacations(userId: string) {
  return prisma.vacation.findMany({
    where: { userId },
    select: { id: true, startDate: true, endDate: true, notes: true, status: true, reviewedAt: true, createdAt: true },
    orderBy: { startDate: 'desc' },
  })
}

export async function reviewVacation(id: string, reviewedBy: string, status: RequestStatus) {
  const vacation = await prisma.vacation.findUnique({ where: { id } })
  if (!vacation) throw new AppError('Férias não encontradas', 404)
  return prisma.vacation.update({
    where: { id },
    data: { status, reviewedBy, reviewedAt: new Date() },
    select: { id: true, status: true, reviewedAt: true },
  })
}
