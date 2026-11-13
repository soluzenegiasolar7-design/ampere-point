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

// Nunca selecionar attachmentData nas listagens: o arquivo vai só pela rota de download.
const listSelect = {
  id: true, date: true, type: true, reason: true, status: true,
  reviewedAt: true, reviewNote: true, attachmentName: true, createdAt: true,
} as const

export async function listMyAbsences(userId: string) {
  return prisma.absence.findMany({ where: { userId }, select: listSelect, orderBy: { date: 'desc' } })
}

export async function listAllAbsences(status?: string) {
  return prisma.absence.findMany({
    where: status ? { status: status as RequestStatus } : {},
    select: { ...listSelect, user: { select: { id: true, name: true, unit: true } } },
    orderBy: { date: 'desc' },
  })
}

export async function listUserAbsences(userId: string) {
  return prisma.absence.findMany({ where: { userId }, select: listSelect, orderBy: { date: 'desc' } })
}

export async function getAbsenceAttachment(id: string, requesterId: string, requesterRole: string) {
  const absence = await prisma.absence.findUnique({
    where: { id },
    select: { userId: true, attachmentData: true, attachmentName: true },
  })
  if (!absence) throw new AppError('Ausência não encontrada', 404)
  if (absence.userId !== requesterId && !['ADMIN', 'MANAGER'].includes(requesterRole)) {
    throw new AppError('Acesso negado', 403)
  }
  if (!absence.attachmentData) throw new AppError('Esta ausência não tem anexo', 404)
  return { data: Buffer.from(absence.attachmentData), name: absence.attachmentName ?? 'atestado' }
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
