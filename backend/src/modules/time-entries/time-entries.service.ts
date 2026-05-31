import { PunchType } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'

const SEQUENCE: PunchType[] = ['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA']

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(); end.setHours(23, 59, 59, 999)
  return { start, end }
}

export async function punch(userId: string, data: {
  type: PunchType; latitude: number; longitude: number
  accuracy?: number; photoUrl?: string; ipAddress?: string; deviceInfo?: string
}) {
  const { start, end } = todayRange()

  const todayEntries = await prisma.timeEntry.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'asc' },
  })

  const nextExpected = SEQUENCE[todayEntries.length]
  if (!nextExpected) throw new AppError('Todos os pontos do dia já foram registrados', 400)
  if (data.type !== nextExpected) {
    throw new AppError(`Próximo ponto esperado: ${nextExpected.replace('_', ' ')}`, 400)
  }

  const entry = await prisma.timeEntry.create({ data: { userId, ...data } })

  // Atualiza status do WorkDay
  const dateOnly = new Date(); dateOnly.setHours(0, 0, 0, 0)
  await prisma.workDay.upsert({
    where: { userId_date: { userId, date: dateOnly } },
    update: { status: data.type === 'SAIDA' ? 'FORA' : 'EM_SERVICO' },
    create: { userId, date: dateOnly, status: 'EM_SERVICO' },
  })

  return entry
}

export async function listTodayEntries(userId: string) {
  const { start, end } = todayRange()
  return prisma.timeEntry.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'asc' },
  })
}

export async function listEntriesByDate(userId: string, date: string) {
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const end = new Date(date); end.setHours(23, 59, 59, 999)
  return prisma.timeEntry.findMany({
    where: { userId, timestamp: { gte: d, lte: end } },
    orderBy: { timestamp: 'asc' },
    include: { user: { select: { name: true, unit: true } } },
  })
}

export async function listAllTodayEntries() {
  const { start, end } = todayRange()
  return prisma.timeEntry.findMany({
    where: { timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'desc' },
    include: { user: { select: { id: true, name: true, unit: true } } },
  })
}

export async function nextPunchType(userId: string): Promise<PunchType | null> {
  const { start, end } = todayRange()
  const count = await prisma.timeEntry.count({
    where: { userId, timestamp: { gte: start, lte: end } },
  })
  return SEQUENCE[count] ?? null
}
