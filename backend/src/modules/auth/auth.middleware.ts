import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { AppError } from '../../shared/errors/AppError'

export interface AuthRequest extends Request {
  userId: string
  userRole: string
}

function verifyToken(token: string): { userId: string; role: string } {
  return jwt.verify(token, env.JWT_SECRET) as { userId: string; role: string }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new AppError('Não autorizado', 401)
  try {
    const payload = verifyToken(header.slice(7))
    ;(req as AuthRequest).userId = payload.userId
    ;(req as AuthRequest).userRole = payload.role
    next()
  } catch {
    throw new AppError('Token inválido', 401)
  }
}

export function requireAuthPhoto(req: Request, res: Response, next: NextFunction) {
  const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '')
  if (!token) { res.status(401).end(); return }
  try {
    const payload = verifyToken(token)
    ;(req as AuthRequest).userId = payload.userId
    ;(req as AuthRequest).userRole = payload.role
    next()
  } catch {
    res.status(401).end()
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = (req as AuthRequest).userRole
    if (!roles.includes(role)) throw new AppError('Acesso negado', 403)
    next()
  }
}
