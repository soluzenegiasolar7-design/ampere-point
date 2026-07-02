import { prisma } from '../../config/database'
import { AbsenceType, RequestStatus } from '@prisma/client'
import { AppError } from '../../shared/errors/AppError'

export async function createAbsence(data: {
  userId: string; date: Date; type: AbsenceType
  reason?: string; attachmentData?: Buffer; attachmentName?: string
}) {
  const attachmentData = data.attachmentData as unknown as Uint8Array<ArrayBuffer> | undefined
  return prisma.absence.upsert({
    where: { userId_date: { userId: data.userId, date: data.date } },
    create: { userId: data.userId, date: data.date, type: data.type, reason: data.reason, attachmentData, attachmentName: data.attachmentName },
    update: { type: data.type, reason: data.reason, attachmentData, attachmentName: data.attachmentName, status: 'PENDING' },
    select: { id: true, userId: true, date: true, type: true, reason: true, status: true, createdAt: true },
  })
}

export async function listMyAbsences(userId: string) {
  return prisma.absence.findMany({
    where: { userId },
    select: { id: true, date: true, type: true, reason: true, status: true, reviewedAt: true, reviewNote: true, createdAt: true },
    orderBy: { date: 'desc' },
  })
}

export async function listAllAbsences(status?: string) {
  return prisma.absence.findMany({
    where: status ? { status: status as RequestStatus } : {},
    include: { user: { select: { id: true, name: true, unit: true } } },
    orderBy: { date: 'desc' },
  })
}

export async function listUserAbsences(userId: string) {
  return prisma.absence.findMany({
    where: { userId },
    select: { id: true, date: true, type: true, reason: true, status: true, reviewedAt: true, reviewNote: true, createdAt: true },
    orderBy: { date: 'desc' },
  })
}

export async function reviewAbsence(id: string, reviewedBy: string, status: RequestStatus, reviewNote?: string) {
  const absence = await prisma.absence.findUnique({ where: { id } })
  if (!absence) throw new AppError('Ausência não encontrada', 404)
  return prisma.absence.update({
    where: { id },
    data: { status, reviewedBy, reviewedAt: new Date(), reviewNote },
    select: { id: true, status: true, reviewedAt: true, reviewNote: true },
  })
}
