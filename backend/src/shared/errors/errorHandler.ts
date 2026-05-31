import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from './AppError'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message })
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Dados inválidos', details: err.issues })
  }
  console.error(err)
  return res.status(500).json({ error: 'Erro interno do servidor' })
}
