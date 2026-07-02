import bcrypt from 'bcryptjs'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { UserRole } from '@prisma/client'

const userSelect = {
  id: true, name: true, email: true, role: true, unit: true, phone: true,
  pis: true, cpf: true, isActive: true, hireDate: true, contractHours: true, createdAt: true,
}

export async function listUsers(unit?: string, includeInactive?: boolean, includeToken?: boolean) {
  return prisma.user.findMany({
    where: { ...(includeInactive ? {} : { isActive: true }), ...(unit ? { unit } : {}) },
    select: { ...userSelect, ...(includeToken ? { gpsToken: true } : {}) },
    orderBy: { name: 'asc' },
  })
}

export async function createUser(data: {
  name: string; email: string; password: string
  role?: UserRole; unit?: string; phone?: string; cpf?: string; pis?: string
  hireDate?: string; contractHours?: number
}) {
  const exists = await prisma.user.findUnique({ where: { email: data.email } })
  if (exists) throw new AppError('Email já cadastrado', 409)
  const passwordHash = await bcrypt.hash(data.password, 10)
  const { password, hireDate, ...rest } = data as any
  const user = await prisma.user.create({
    data: { ...rest, passwordHash, ...(hireDate ? { hireDate: new Date(hireDate) } : {}) },
    select: userSelect,
  })
  return user
}

export async function updateUser(id: string, data: Partial<{
  name: string; role: UserRole; unit: string; phone: string; cpf: string; pis: string
  isActive: boolean; password: string; hireDate: string; contractHours: number
}>) {
  const { password, hireDate, ...rest } = data as any
  const update: any = { ...rest }
  if (password) update.passwordHash = await bcrypt.hash(password, 10)
  if (hireDate) update.hireDate = new Date(hireDate)
  return prisma.user.update({
    where: { id },
    data: update,
    select: userSelect,
  })
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
  })
  if (!user) throw new AppError('Funcionário não encontrado', 404)
  return user
}
