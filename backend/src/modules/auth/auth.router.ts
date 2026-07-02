import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { login, getMe } from './auth.service'
import { requireAuth, AuthRequest } from './auth.middleware'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body)
    const result = await login(email, password)
    res.json(result)
  } catch (e) { next(e) }
})

router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getMe((req as AuthRequest).userId)
    res.json(user)
  } catch (e) { next(e) }
})

export default router
