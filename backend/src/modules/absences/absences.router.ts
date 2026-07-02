import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import { createAbsence, listMyAbsences, listAllAbsences, listUserAbsences, reviewAbsence } from './absences.service'

const router = Router()
router.use(requireAuth)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const createSchema = z.object({
  userId: z.string().optional(),
  date: z.string(),
  type: z.enum(['FALTA', 'ATESTADO', 'ABONADA']).default('FALTA'),
  reason: z.string().optional(),
})

router.post('/', upload.single('attachment'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req as AuthRequest
    const data = createSchema.parse(req.body)
    const targetUserId = ['ADMIN', 'MANAGER'].includes(auth.userRole) && data.userId ? data.userId : auth.userId
    res.status(201).json(await createAbsence({
      userId: targetUserId,
      date: new Date(data.date),
      type: data.type as any,
      reason: data.reason,
      attachmentData: req.file?.buffer,
      attachmentName: req.file?.originalname,
    }))
  } catch (e) { next(e) }
})

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listMyAbsences((req as AuthRequest).userId))
  } catch (e) { next(e) }
})

router.get('/', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listAllAbsences(req.query.status as string | undefined))
  } catch (e) { next(e) }
})

router.get('/user/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listUserAbsences(req.params.userId as string))
  } catch (e) { next(e) }
})

router.patch('/:id/review', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, reviewNote } = z.object({
      status: z.enum(['APPROVED', 'REJECTED']),
      reviewNote: z.string().optional(),
    }).parse(req.body)
    res.json(await reviewAbsence(req.params.id as string, (req as AuthRequest).userId, status as any, reviewNote))
  } catch (e) { next(e) }
})

export default router
