import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { AppError } from '../../shared/errors/AppError'

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive) throw new AppError('Credenciais inválidas', 401)
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new AppError('Credenciais inválidas', 401)
  const token = jwt.sign({ userId: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '7d' })
  const { passwordHash: _, ...safe } = user
  return { token, user: safe }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError('Usuário não encontrado', 404)
  const { passwordHash: _, ...safe } = user
  return safe
}
