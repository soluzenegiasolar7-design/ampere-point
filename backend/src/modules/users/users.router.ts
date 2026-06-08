import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { listUsers, createUser, updateUser, getUser } from './users.service'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unit = req.query.unit as string | undefined
    // cast to string if array
    const unitStr = Array.isArray(unit) ? unit[0] : unit
    res.json(await listUsers(unitStr))
  } catch (e) { next(e) }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getUser(req.params.id as string))
  } catch (e) { next(e) }
})

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().min(3).refine(v => v.includes('@'), { message: 'Email deve conter @' }),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
  unit: z.string().optional(),
  phone: z.string().optional(),
  cpf: z.string().optional(),
  pis: z.string().optional(),
})

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSchema.parse(req.body)
    res.status(201).json(await createUser(data))
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await updateUser(req.params.id as string, req.body))
  } catch (e) { next(e) }
})

export default router
