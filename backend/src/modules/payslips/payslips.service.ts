import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'

export async function uploadPayslip(data: {
  userId: string; month: number; year: number
  fileName: string; fileData: Buffer; uploadedBy: string
}) {
  const fileData = data.fileData as unknown as Uint8Array<ArrayBuffer>
  return prisma.payslip.upsert({
    where: { userId_month_year: { userId: data.userId, month: data.month, year: data.year } },
    create: { userId: data.userId, month: data.month, year: data.year, fileName: data.fileName, fileData, uploadedBy: data.uploadedBy },
    update: { fileName: data.fileName, fileData, uploadedBy: data.uploadedBy },
    select: { id: true, userId: true, month: true, year: true, fileName: true, createdAt: true },
  })
}

export async function listMyPayslips(userId: string) {
  return prisma.payslip.findMany({
    where: { userId },
    select: { id: true, month: true, year: true, fileName: true, createdAt: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
}

export async function listUserPayslips(userId: string) {
  return prisma.payslip.findMany({
    where: { userId },
    select: { id: true, month: true, year: true, fileName: true, createdAt: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
}

export async function downloadPayslip(id: string, requesterId: string, requesterRole: string) {
  const payslip = await prisma.payslip.findUnique({ where: { id } })
  if (!payslip) throw new AppError('Holerite não encontrado', 404)
  if (requesterRole === 'EMPLOYEE' && payslip.userId !== requesterId)
    throw new AppError('Acesso negado', 403)
  return payslip
}
