import { PunchType } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { createLog } from '../gps-logs/gps-logs.service'

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'AmperePoint/1.0' }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const json = await res.json() as { display_name?: string }
    return json.display_name ?? null
  } catch {
    return null
  }
}

const SEQUENCE: PunchType[] = ['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA']

// "hoje" no fuso de Recife/Fortaleza (UTC-3, sem horário de verão)
// ex: 22:12 local = 01:12 UTC do dia seguinte — tem que ser tratado como o mesmo dia
export function brtTodayRange() {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' }) // 'YYYY-MM-DD'
  return {
    start:   new Date(`${d}T00:00:00-03:00`),
    end:     new Date(`${d}T23:59:59.999-03:00`),
    dateKey: new Date(`${d}T00:00:00.000Z`), // chave canônica para WorkDay.date
  }
}

function todayRange() {
  const { start, end } = brtTodayRange()
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

  // Geocodificação reversa em background — não bloqueia a resposta
  reverseGeocode(data.latitude, data.longitude).then(address => {
    if (address) prisma.timeEntry.update({ where: { id: entry.id }, data: { address } }).catch(() => {})
  }).catch(() => {})

  // Grava a localização do ponto no gpsLog para garantir que
  // a posição final seja incluída no cálculo de KM do dia
  await createLog(userId, {
    latitude: data.latitude,
    longitude: data.longitude,
    accuracy: data.accuracy,
  })

  // Atualiza status do WorkDay usando data BRT
  const { dateKey } = brtTodayRange()
  await prisma.workDay.upsert({
    where: { userId_date: { userId, date: dateKey } },
    update: { status: data.type === 'SAIDA' ? 'FORA' : 'EM_SERVICO' },
    create: { userId, date: dateKey, status: 'EM_SERVICO' },
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

export async function recalcTotalMinutes(userId: string) {
  const { start, end, dateKey } = brtTodayRange()

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
    where: { userId_date: { userId, date: dateKey } },
    update: { totalMinutes: Math.max(0, totalMinutes) },
    create: { userId, date: dateKey, totalMinutes: Math.max(0, totalMinutes) },
  })
}

export async function nextPunchType(userId: string): Promise<PunchType | null> {
  const { start, end } = todayRange()
  const count = await prisma.timeEntry.count({
    where: { userId, timestamp: { gte: start, lte: end } },
  })
  return SEQUENCE[count] ?? null
}
