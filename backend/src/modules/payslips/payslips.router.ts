import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { requireAuth, requireRole, AuthRequest } from '../auth/auth.middleware'
import { uploadPayslip, listMyPayslips, listUserPayslips, downloadPayslip } from './payslips.service'

const router = Router()
router.use(requireAuth)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

router.post('/', requireRole('ADMIN', 'MANAGER'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, month, year } = req.body
    if (!req.file) throw new Error('Arquivo obrigatório')
    if (!userId || !month || !year) throw new Error('userId, month e year são obrigatórios')
    const result = await uploadPayslip({
      userId, month: Number(month), year: Number(year),
      fileName: req.file.originalname,
      fileData: req.file.buffer,
      uploadedBy: (req as AuthRequest).userId,
    })
    res.status(201).json(result)
  } catch (e) { next(e) }
})

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listMyPayslips((req as AuthRequest).userId))
  } catch (e) { next(e) }
})

router.get('/user/:userId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listUserPayslips(req.params.userId as string))
  } catch (e) { next(e) }
})

router.get('/:id/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payslip = await downloadPayslip(
      req.params.id as string,
      (req as AuthRequest).userId,
      (req as AuthRequest).userRole,
    )
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${payslip.fileName}"`)
    res.send(Buffer.from(payslip.fileData))
  } catch (e) { next(e) }
})

export default router
