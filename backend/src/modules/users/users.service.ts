import bcrypt from 'bcryptjs'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { UserRole } from '@prisma/client'

export async function listUsers(unit?: string, includeInactive?: boolean, includeToken?: boolean) {
  return prisma.user.findMany({
    where: { ...(includeInactive ? {} : { isActive: true }), ...(unit ? { unit } : {}) },
    select: { id: true, name: true, email: true, role: true, unit: true, phone: true, pis: true, cpf: true, isActive: true, createdAt: true, ...(includeToken ? { gpsToken: true } : {}) },
    orderBy: { name: 'asc' },
  })
}

export async function createUser(data: {
  name: string; email: string; password: string
  role?: UserRole; unit?: string; phone?: string; cpf?: string; pis?: string
}) {
  const exists = await prisma.user.findUnique({ where: { email: data.email } })
  if (exists) throw new AppError('Email já cadastrado', 409)
  const passwordHash = await bcrypt.hash(data.password, 10)
  const user = await prisma.user.create({
    data: { ...data, passwordHash, password: undefined } as any,
    select: { id: true, name: true, email: true, role: true, unit: true, createdAt: true },
  })
  return user
}

export async function updateUser(id: string, data: Partial<{
  name: string; role: UserRole; unit: string; phone: string; isActive: boolean; password: string
}>) {
  const { password, ...rest } = data
  const update: any = { ...rest }
  if (password) update.passwordHash = await bcrypt.hash(password, 10)
  return prisma.user.update({
    where: { id },
    data: update,
    select: { id: true, name: true, email: true, role: true, unit: true, isActive: true },
  })
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, unit: true, phone: true, pis: true, isActive: true, createdAt: true },
  })
  if (!user) throw new AppError('Funcionário não encontrado', 404)
  return user
}
