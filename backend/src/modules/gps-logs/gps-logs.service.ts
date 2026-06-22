import { prisma } from '../../config/database'
import { brtTodayRange } from '../time-entries/time-entries.service'
import { haversineKm } from '../../shared/utils/haversine'

// Velocidade mínima (km/h) para contabilizar deslocamento.
// Caminhada: ~3-6 km/h. Veículo mais lento: ~10 km/h.
// 8 km/h filtra a pé e mantém carro/moto mesmo em trânsito parado se logo depois acelerar.
const MIN_VEHICLE_KMH = 8

export async function createLog(userId: string, data: {
  latitude: number; longitude: number; accuracy?: number; speed?: number
}) {
  const log = await prisma.gpsLog.create({ data: { userId, ...data } })

  const { start, end, dateKey: dateOnly } = brtTodayRange()


  const logs = await prisma.gpsLog.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'asc' },
    select: { latitude: true, longitude: true, timestamp: true },
  })

  const totalKm = calcVehicleKm(logs)

  await prisma.workDay.upsert({
    where: { userId_date: { userId, date: dateOnly } },
    update: { totalKm: parseFloat(totalKm.toFixed(2)) },
    create: { userId, date: dateOnly, totalKm: parseFloat(totalKm.toFixed(2)) },
  })

  return log
}

function calcVehicleKm(logs: { latitude: number; longitude: number; timestamp: Date }[]): number {
  let total = 0
  for (let i = 1; i < logs.length; i++) {
    const prev = logs[i - 1]
    const curr = logs[i]
    const distKm   = haversineKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
    const deltaHrs = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 3_600_000
    if (deltaHrs <= 0) continue
    const speedKmh = distKm / deltaHrs
    if (speedKmh >= MIN_VEHICLE_KMH) total += distKm
  }
  return total
}

export async function getTodayTrail(userId: string) {
  const { start, end } = brtTodayRange()
  return prisma.gpsLog.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'asc' },
    select: { latitude: true, longitude: true, timestamp: true, speed: true },
  })
}

export async function getTrailByDate(userId: string, dateStr: string) {
  const d   = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const end = new Date(dateStr); end.setHours(23, 59, 59, 999)
  return prisma.gpsLog.findMany({
    where: { userId, timestamp: { gte: d, lte: end } },
    orderBy: { timestamp: 'asc' },
    select: { latitude: true, longitude: true, timestamp: true, speed: true },
  })
}

export async function getTrailByRange(userId: string, dateFrom: string, dateTo: string) {
  const start = new Date(dateFrom); start.setHours(0, 0, 0, 0)
  const end   = new Date(dateTo);   end.setHours(23, 59, 59, 999)
  return prisma.gpsLog.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'asc' },
    select: { latitude: true, longitude: true, timestamp: true, speed: true },
  })
}
