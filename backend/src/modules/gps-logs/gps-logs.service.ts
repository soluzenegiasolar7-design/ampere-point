import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { brtTodayRange, brtDateRange } from '../time-entries/time-entries.service'
import { haversineKm } from '../../shared/utils/haversine'

// Velocidade mínima (km/h) para contabilizar deslocamento.
// Caminhada: ~3-6 km/h. Veículo mais lento: ~10 km/h.
// 8 km/h filtra a pé e mantém carro/moto mesmo em trânsito parado se logo depois acelerar.
const MIN_VEHICLE_KMH = 8

// Resolução usada só na LEITURA (mapa e cálculo de KM): 1 ponto a cada 10s.
// O banco guarda todos os pontos; isso só evita carregar milhares de linhas por consulta.
export const MIN_INTERVAL_SEC = 10

type Point = { latitude: number; longitude: number; accuracy?: number; speed?: number; timestamp: Date }

// Pontos de um intervalo, no máximo 1 a cada MIN_INTERVAL_SEC (tolera duplicatas antigas no banco)
export async function thinnedLogs(userId: string, start: Date, end: Date) {
  const bucket = Prisma.raw(`floor(extract(epoch FROM "timestamp") / ${MIN_INTERVAL_SEC})`)
  return prisma.$queryRaw<{ latitude: number; longitude: number; timestamp: Date; speed: number | null }[]>`
    SELECT latitude, longitude, timestamp, speed FROM (
      SELECT DISTINCT ON (${bucket})
             latitude, longitude, "timestamp", speed
      FROM gps_logs
      WHERE "userId" = ${userId} AND "timestamp" >= ${start} AND "timestamp" <= ${end}
      ORDER BY ${bucket}, "timestamp"
    ) t ORDER BY "timestamp" ASC`
}

// Grava um lote de pontos (sync do celular) sem reenvios duplicados e recalcula o KM dos dias afetados.
export async function savePoints(userId: string, points: Point[]) {
  if (points.length === 0) return 0
  const sorted = [...points].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  const minTs = sorted[0].timestamp
  const maxTs = sorted[sorted.length - 1].timestamp

  // Só descarta reenvios do MESMO ponto (mesmo horário exato). Todo ponto real é guardado.
  const existing = await prisma.gpsLog.findMany({
    where: { userId, timestamp: { gte: minTs, lte: maxTs } },
    select: { timestamp: true },
  })
  const taken = new Set(existing.map(e => e.timestamp.getTime()))

  const toInsert: Point[] = []
  for (const p of sorted) {
    const t = p.timestamp.getTime()
    if (taken.has(t)) continue
    taken.add(t)
    toInsert.push(p)
  }
  if (toInsert.length > 0) {
    await prisma.gpsLog.createMany({ data: toInsert.map(p => ({ userId, ...p })) })
  }

  const days = new Map<string, Date>()
  for (const p of toInsert) {
    const r = brtDateRange(p.timestamp)
    days.set(r.dateKey.toISOString(), p.timestamp)
  }
  for (const ts of days.values()) await recalcDayKm(userId, ts)
  return toInsert.length
}

// Grava um ponto avulso (bater ponto, OwnTracks) com o horário atual
export async function createLog(userId: string, data: {
  latitude: number; longitude: number; accuracy?: number; speed?: number
}) {
  return savePoints(userId, [{ ...data, timestamp: new Date() }])
}

export async function recalcDayKm(userId: string, forDate: Date) {
  const { start, end, dateKey } = brtDateRange(forDate)
  const logs = await thinnedLogs(userId, start, end)
  const totalKm = parseFloat(calcVehicleKm(logs).toFixed(2))
  await prisma.workDay.upsert({
    where: { userId_date: { userId, date: dateKey } },
    update: { totalKm },
    create: { userId, date: dateKey, totalKm },
  })
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
  return thinnedLogs(userId, start, end)
}

export async function getTrailByDate(userId: string, dateStr: string) {
  const d   = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const end = new Date(dateStr); end.setHours(23, 59, 59, 999)
  return thinnedLogs(userId, d, end)
}

export async function getTrailByRange(userId: string, dateFrom: string, dateTo: string) {
  const start = new Date(dateFrom); start.setHours(0, 0, 0, 0)
  const end   = new Date(dateTo);   end.setHours(23, 59, 59, 999)
  return thinnedLogs(userId, start, end)
}
