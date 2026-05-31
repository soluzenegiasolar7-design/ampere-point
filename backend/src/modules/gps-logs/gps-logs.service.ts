import { prisma } from '../../config/database'
import { haversineKm } from '../../shared/utils/haversine'

export async function createLog(userId: string, data: {
  latitude: number; longitude: number; accuracy?: number; speed?: number
}) {
  const log = await prisma.gpsLog.create({ data: { userId, ...data } })

  // Recalcula KM do dia
  const dateOnly = new Date(); dateOnly.setHours(0, 0, 0, 0)
  const end = new Date(); end.setHours(23, 59, 59, 999)

  const logs = await prisma.gpsLog.findMany({
    where: { userId, timestamp: { gte: dateOnly, lte: end } },
    orderBy: { timestamp: 'asc' },
    select: { latitude: true, longitude: true },
  })

  let totalKm = 0
  for (let i = 1; i < logs.length; i++) {
    totalKm += haversineKm(logs[i - 1].latitude, logs[i - 1].longitude, logs[i].latitude, logs[i].longitude)
  }

  await prisma.workDay.upsert({
    where: { userId_date: { userId, date: dateOnly } },
    update: { totalKm: parseFloat(totalKm.toFixed(2)) },
    create: { userId, date: dateOnly, totalKm: parseFloat(totalKm.toFixed(2)) },
  })

  return log
}

export async function getTodayTrail(userId: string) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(); end.setHours(23, 59, 59, 999)
  return prisma.gpsLog.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'asc' },
    select: { latitude: true, longitude: true, timestamp: true, speed: true },
  })
}
