import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { login, getMe } from './auth.service'
import { requireAuth, AuthRequest } from './auth.middleware'

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
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
