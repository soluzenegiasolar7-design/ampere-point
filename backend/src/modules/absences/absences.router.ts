import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import { AppError } from '../../shared/errors/AppError'
import { createAbsence, listMyAbsences, listAllAbsences, listUserAbsences, reviewAbsence, getAbsenceAttachment } from './absences.service'

const router = Router()
router.use(requireAuth)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const createSchema = z.object({
  userId: z.string().optional(),
  date: z.string(),
  type: z.enum(['FALTA', 'ATESTADO', 'ABONADA']).default('FALTA'),
  reason: z.string().optional(),
})

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
}

router.post('/', upload.single('attachment'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req as AuthRequest
    const data = createSchema.parse(req.body)
    const isManager = ['ADMIN', 'MANAGER'].includes(auth.userRole)
    const targetUserId = isManager && data.userId ? data.userId : auth.userId
    // Funcionário só pode enviar atestado, e precisa anexar o documento.
    if (!isManager && !req.file) throw new AppError('Anexe a foto ou o PDF do atestado', 400)
    const fileExt = req.file?.originalname.split('.').pop()?.toLowerCase() ?? ''
    if (req.file && !ALLOWED_MIME.includes(req.file.mimetype) && !MIME_BY_EXT[fileExt]) {
      throw new AppError('Formato não aceito. Envie foto (JPG, PNG, HEIC) ou PDF', 400)
    }
    res.status(201).json(await createAbsence({
      userId: targetUserId,
      date: new Date(data.date),
      type: (isManager ? data.type : 'ATESTADO') as any,
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

router.get('/:id/attachment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req as AuthRequest
    const file = await getAbsenceAttachment(req.params.id as string, auth.userId, auth.userRole)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    res.setHeader('Content-Type', MIME_BY_EXT[ext] ?? 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`)
    res.send(file.data)
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
