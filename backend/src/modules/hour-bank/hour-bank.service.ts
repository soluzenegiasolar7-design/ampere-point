import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'

const EXPIRATION_WINDOW_MONTHS = 6

function buildDefaultFrom(hireDate: Date | null, createdAt: Date) {
  return hireDate ?? createdAt
}

function buildDateRange(dateFrom: string | undefined, dateTo: string | undefined, defaultFrom: Date) {
  const from = dateFrom ? new Date(dateFrom) : defaultFrom
  const to = dateTo ? new Date(dateTo) : new Date()
  return { from, to }
}

function monthsAgo(n: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d
}

async function calcAccrual(userId: string, from: Date, to: Date) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, contractHours: true, unit: true, hireDate: true },
  })
  if (!user) return null

  const workDays = await prisma.workDay.findMany({
    where: { userId, date: { gte: from, lte: to }, status: { not: 'PENDENTE' } },
    orderBy: { date: 'asc' },
  })

  const dailyMinutes = user.contractHours * 60
  let totalWorkedMinutes = 0
  let totalExpectedMinutes = 0
  let workedDays = 0

  for (const wd of workDays) {
    totalWorkedMinutes += wd.totalMinutes
    totalExpectedMinutes += dailyMinutes
    if (wd.totalMinutes > 0) workedDays++
  }

  return {
    user,
    workedDays,
    totalWorkedMinutes,
    totalExpectedMinutes,
    accrualMinutes: totalWorkedMinutes - totalExpectedMinutes,
  }
}

async function sumLedger(userId: string, from: Date, to: Date) {
  const result = await prisma.hourBankEntry.aggregate({
    where: { userId, date: { gte: from, lte: to } },
    _sum: { minutes: true },
  })
  return result._sum.minutes ?? 0
}

async function getExpiringBalance(userId: string, from: Date, to: Date) {
  const cutoff = monthsAgo(EXPIRATION_WINDOW_MONTHS)
  if (cutoff <= from) return 0

  const [oldAccrual, oldLedger, currentAccrual, currentLedger] = await Promise.all([
    calcAccrual(userId, from, cutoff),
    sumLedger(userId, from, cutoff),
    calcAccrual(userId, from, to),
    sumLedger(userId, from, to),
  ])

  const oldBalance = (oldAccrual?.accrualMinutes ?? 0) + oldLedger
  const currentBalance = (currentAccrual?.accrualMinutes ?? 0) + currentLedger

  if (oldBalance <= 0 || currentBalance <= 0) return 0
  return Math.min(oldBalance, currentBalance)
}

async function buildHourBankResult(userId: string, dateFrom?: string, dateTo?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, unit: true, contractHours: true, hireDate: true, createdAt: true },
  })
  if (!user) return null

  const { from, to } = buildDateRange(dateFrom, dateTo, buildDefaultFrom(user.hireDate, user.createdAt))

  const [accrual, ledgerMinutes, expiringMinutes] = await Promise.all([
    calcAccrual(userId, from, to),
    sumLedger(userId, from, to),
    getExpiringBalance(userId, from, to),
  ])
  if (!accrual) return null

  const balanceMinutes = accrual.accrualMinutes + ledgerMinutes
  const balanceHours = balanceMinutes / 60

  return {
    userId: user.id,
    name: user.name,
    unit: user.unit,
    contractHours: user.contractHours,
    hireDate: user.hireDate,
    workedDays: accrual.workedDays,
    totalWorkedMinutes: accrual.totalWorkedMinutes,
    totalWorkedHours: +(accrual.totalWorkedMinutes / 60).toFixed(2),
    totalExpectedMinutes: accrual.totalExpectedMinutes,
    totalExpectedHours: +(accrual.totalExpectedMinutes / 60).toFixed(2),
    accrualMinutes: accrual.accrualMinutes,
    ledgerMinutes,
    balanceMinutes,
    balanceHours: +balanceHours.toFixed(2),
    balanceLabel: balanceHours >= 0
      ? `+${balanceHours.toFixed(1)}h`
      : `${balanceHours.toFixed(1)}h`,
    expiringMinutes,
    expiringHours: +(expiringMinutes / 60).toFixed(2),
    windowMonths: EXPIRATION_WINDOW_MONTHS,
    period: { from, to },
  }
}

export async function getMyHourBank(userId: string, dateFrom?: string, dateTo?: string) {
  return buildHourBankResult(userId, dateFrom, dateTo)
}

export async function getUserHourBank(userId: string, dateFrom?: string, dateTo?: string) {
  return buildHourBankResult(userId, dateFrom, dateTo)
}

export async function getTeamHourBank(dateFrom?: string, dateTo?: string, unit?: string) {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: 'EMPLOYEE', ...(unit ? { unit } : {}) },
    select: { id: true },
  })
  const results = await Promise.all(users.map(u => buildHourBankResult(u.id, dateFrom, dateTo)))
  return results.filter(Boolean)
}

export async function syncDayOffDebit(dayOffId: string, userId: string, date: Date, approved: boolean, actorId: string) {
  await prisma.hourBankEntry.deleteMany({ where: { reference: dayOffId, type: 'DAYOFF_DEBIT' } })
  if (!approved) return

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { contractHours: true } })
  if (!user) return

  await prisma.hourBankEntry.create({
    data: {
      userId,
      type: 'DAYOFF_DEBIT',
      minutes: -Math.round(user.contractHours * 60),
      date,
      reference: dayOffId,
      reason: 'Folga aprovada',
      createdBy: actorId,
    },
  })
}

export async function createManualAdjustment(data: {
  userId: string; minutes: number; date: Date; reason: string; createdBy: string
}) {
  if (data.minutes === 0) throw new AppError('Informe uma quantidade de minutos diferente de zero', 400)
  return prisma.hourBankEntry.create({
    data: {
      userId: data.userId,
      type: data.minutes > 0 ? 'MANUAL_CREDIT' : 'MANUAL_DEBIT',
      minutes: data.minutes,
      date: data.date,
      reason: data.reason,
      createdBy: data.createdBy,
    },
    select: { id: true, userId: true, type: true, minutes: true, date: true, reason: true, createdBy: true, createdAt: true },
  })
}

export async function listEntries(userId: string, dateFrom?: string, dateTo?: string) {
  return prisma.hourBankEntry.findMany({
    where: {
      userId,
      ...(dateFrom || dateTo ? {
        date: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(dateTo) } : {}),
        },
      } : {}),
    },
    orderBy: { date: 'desc' },
    select: { id: true, type: true, minutes: true, date: true, reason: true, createdBy: true, createdAt: true },
  })
}

export async function deleteManualEntry(id: string) {
  const entry = await prisma.hourBankEntry.findUnique({ where: { id } })
  if (!entry) throw new AppError('Lançamento não encontrado', 404)
  if (entry.type === 'DAYOFF_DEBIT') {
    throw new AppError('Débito de folga só pode ser revertido rejeitando a folga correspondente', 400)
  }
  await prisma.hourBankEntry.delete({ where: { id } })
}
