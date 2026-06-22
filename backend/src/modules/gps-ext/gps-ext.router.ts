import { Router, Request, Response } from 'express'
import { createLog } from '../gps-logs/gps-logs.service'
import { prisma } from '../../config/database'
import { getIo } from '../../socket/io'

const router = Router()

// OwnTracks HTTP mode POST
// URL: https://ampere-point-production.up.railway.app/api/gps-ext/{userId}?token={gpsToken}
// Body enviado pelo OwnTracks: { _type: "location", lat, lon, acc, vel, tst }
router.post('/:userId', async (req: Request, res: Response) => {
  const userId = req.params.userId as string
  const gpsToken = req.query.token as string | undefined
  const body = req.body

  if (body._type && body._type !== 'location') return res.json([])

  const lat = body.lat ?? body.latitude
  const lon = body.lon ?? body.longitude ?? body.lng
  const acc = body.acc ?? body.accuracy
  const vel = body.vel ?? body.speed

  if (!lat || !lon) return res.status(400).json({ error: 'lat/lon obrigatório' })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, gpsToken: true } })
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
  if (!gpsToken || gpsToken !== user.gpsToken) return res.status(401).json({ error: 'Token inválido' })

  await createLog(userId, {
    latitude: Number(lat),
    longitude: Number(lon),
    accuracy: acc ? Number(acc) : undefined,
    speed: vel ? Number(vel) * 3.6 : undefined,
  })

  const io = getIo()
  if (io) {
    io.to('tracking:room').emit('gps:user_location', {
      userId,
      latitude: Number(lat),
      longitude: Number(lon),
      accuracy: acc ? Number(acc) : undefined,
      timestamp: new Date(),
    })
  }

  return res.json([])
})

export default router
