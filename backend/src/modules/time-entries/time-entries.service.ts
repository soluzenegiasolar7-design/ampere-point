import { PunchType } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { createLog } from '../gps-logs/gps-logs.service'

const SEQUENCE: PunchType[] = ['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA']

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(); end.setHours(23, 59, 59, 999)
  return { start, end }
}

export async function punch(userId: string, data: {
  type: PunchType; latitude: number; longitude: number
  accuracy?: number; photoUrl?: string; photoData?: Buffer; ipAddress?: string; deviceInfo?: string
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

  const { photoData, ...rest } = data
  const entry = await prisma.timeEntry.create({ data: { userId, ...rest } })

  // Grava a localização do ponto no gpsLog para garantir que
  // a posição final seja incluída no cálculo de KM do dia
  await createLog(userId, {
    latitude: data.latitude,
    longitude: data.longitude,
    accuracy: data.accuracy,
  })

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

export async function listEntriesByRange(userId: string, dateFrom: string, dateTo: string) {
  const start = new Date(dateFrom); start.setHours(0, 0, 0, 0)
  const end   = new Date(dateTo);   end.setHours(23, 59, 59, 999)
  return prisma.timeEntry.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
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

export async function listAllEntriesByDate(date: string) {
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const end = new Date(date); end.setHours(23, 59, 59, 999)
  return prisma.timeEntry.findMany({
    where: { timestamp: { gte: d, lte: end } },
    orderBy: { timestamp: 'desc' },
    include: { user: { select: { id: true, name: true, unit: true } } },
  })
}

export async function recalcTotalMinutes(userId: string, dateOnly: Date) {
  const start = new Date(dateOnly); start.setHours(0, 0, 0, 0)
  const end = new Date(dateOnly); end.setHours(23, 59, 59, 999)

  const entries = await prisma.timeEntry.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'asc' },
  })

  const byType: Record<string, number> = {}
  for (const e of entries) byType[e.type] = e.timestamp.getTime()

  let totalMinutes = 0
  if (byType['SAIDA'] && byType['ENTRADA']) {
    totalMinutes = Math.round((byType['SAIDA'] - byType['ENTRADA']) / 60000)
    if (byType['SAIDA_ALMOCO'] && byType['RETORNO_ALMOCO']) {
      totalMinutes -= Math.round((byType['RETORNO_ALMOCO'] - byType['SAIDA_ALMOCO']) / 60000)
    }
  } else if (byType['SAIDA_ALMOCO'] && byType['ENTRADA']) {
    totalMinutes = Math.round((byType['SAIDA_ALMOCO'] - byType['ENTRADA']) / 60000)
  }

  await prisma.workDay.upsert({
    where: { userId_date: { userId, date: start } },
    update: { totalMinutes: Math.max(0, totalMinutes) },
    create: { userId, date: start, totalMinutes: Math.max(0, totalMinutes) },
  })
}

export async function nextPunchType(userId: string): Promise<PunchType | null> {
  const { start, end } = todayRange()
  const count = await prisma.timeEntry.count({
    where: { userId, timestamp: { gte: start, lte: end } },
  })
  return SEQUENCE[count] ?? null
}
