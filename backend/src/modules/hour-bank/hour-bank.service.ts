import { prisma } from '../../config/database'

function buildDateRange(dateFrom?: string, dateTo?: string) {
  const from = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const to = dateTo ? new Date(dateTo) : new Date()
  return { from, to }
}

async function calcHourBank(userId: string, from: Date, to: Date) {
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

  const balanceMinutes = totalWorkedMinutes - totalExpectedMinutes
  const balanceHours = balanceMinutes / 60

  return {
    userId: user.id,
    name: user.name,
    unit: user.unit,
    contractHours: user.contractHours,
    hireDate: user.hireDate,
    workedDays,
    totalWorkedMinutes,
    totalWorkedHours: +(totalWorkedMinutes / 60).toFixed(2),
    totalExpectedMinutes,
    totalExpectedHours: +(totalExpectedMinutes / 60).toFixed(2),
    balanceMinutes,
    balanceHours: +balanceHours.toFixed(2),
    balanceLabel: balanceHours >= 0
      ? `+${balanceHours.toFixed(1)}h`
      : `${balanceHours.toFixed(1)}h`,
    period: { from, to },
  }
}

export async function getMyHourBank(userId: string, dateFrom?: string, dateTo?: string) {
  const { from, to } = buildDateRange(dateFrom, dateTo)
  return calcHourBank(userId, from, to)
}

export async function getUserHourBank(userId: string, dateFrom?: string, dateTo?: string) {
  const { from, to } = buildDateRange(dateFrom, dateTo)
  return calcHourBank(userId, from, to)
}

export async function getTeamHourBank(dateFrom?: string, dateTo?: string, unit?: string) {
  const { from, to } = buildDateRange(dateFrom, dateTo)
  const users = await prisma.user.findMany({
    where: { isActive: true, role: 'EMPLOYEE', ...(unit ? { unit } : {}) },
    select: { id: true },
  })
  const results = await Promise.all(users.map(u => calcHourBank(u.id, from, to)))
  return results.filter(Boolean)
}
