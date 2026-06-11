import cron from 'node-cron'
import axios from 'axios'
import { prisma } from '../config/database'
import { brtTodayRange } from '../modules/time-entries/time-entries.service'

const SEQUENCE = ['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA'] as const

const PUNCH_LABELS: Record<string, string> = {
  ENTRADA:        'entrada',
  SAIDA_ALMOCO:   'saída para almoço',
  RETORNO_ALMOCO: 'retorno do almoço',
  SAIDA:          'saída',
}

async function sendWhatsApp(text: string) {
  const { EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, MANAGER_WHATSAPP_NUMBERS } = process.env
  if (!EVOLUTION_API_URL || !MANAGER_WHATSAPP_NUMBERS || !EVOLUTION_INSTANCE) {
    console.log('[punch-alerts] WhatsApp não configurado, pulando envio.')
    return
  }
  const numbers = MANAGER_WHATSAPP_NUMBERS.split(',').map(n => n.trim()).filter(Boolean)
  const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`
  await Promise.all(
    numbers.map(number =>
      axios.post(url, { number, text }, { headers: { apikey: EVOLUTION_API_KEY } })
        .catch(e => console.error(`[punch-alerts] Erro ao enviar para ${number}:`, e.message))
    )
  )
}

async function checkMissedPunch(punchType: typeof SEQUENCE[number]) {
  try {
    const { start, end } = brtTodayRange()

    const employees = await prisma.user.findMany({
      where: { isActive: true, role: 'EMPLOYEE' },
      select: { id: true, name: true, unit: true },
    })

    const todayPunches = await prisma.timeEntry.findMany({
      where: { timestamp: { gte: start, lte: end } },
      select: { userId: true, type: true },
    })

    const punchedUsers: Record<string, Set<string>> = {}
    for (const p of todayPunches) {
      if (!punchedUsers[p.type]) punchedUsers[p.type] = new Set()
      punchedUsers[p.type].add(p.userId)
    }

    let missing: typeof employees

    if (punchType === 'ENTRADA') {
      // Todos os ativos que não bateram entrada
      missing = employees.filter(e => !punchedUsers['ENTRADA']?.has(e.id))
    } else {
      const idx = SEQUENCE.indexOf(punchType)
      const prevType = SEQUENCE[idx - 1]
      // Quem bateu o ponto anterior mas não o atual
      missing = employees.filter(e =>
        punchedUsers[prevType]?.has(e.id) && !punchedUsers[punchType]?.has(e.id)
      )
    }

    if (missing.length === 0) {
      console.log(`[punch-alerts] Todos ok para ${punchType}`)
      return
    }

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife', hour: '2-digit', minute: '2-digit' })
    const names = missing.map(e => `  • ${e.name} (${e.unit})`).join('\n')
    const label = PUNCH_LABELS[punchType]

    const msg = [
      `⚠️ *AmperePoint — Alerta de Ponto*`,
      ``,
      `${missing.length} funcionário${missing.length > 1 ? 's' : ''} ainda não registrou *${label}* (${now}):`,
      ``,
      names,
    ].join('\n')

    console.log(`[punch-alerts] Enviando alerta ${punchType}: ${missing.map(e => e.name).join(', ')}`)
    await sendWhatsApp(msg)
  } catch (err: any) {
    console.error(`[punch-alerts] Erro ao checar ${punchType}:`, err.message)
  }
}

export function startPunchAlerts() {
  // Horários configuráveis via env, padrão BRT
  const timeEntrada       = process.env.ALERT_TIME_ENTRADA        || '09:00'
  const timeSaidaAlmoco   = process.env.ALERT_TIME_SAIDA_ALMOCO   || '12:30'
  const timeRetornoAlmoco = process.env.ALERT_TIME_RETORNO_ALMOCO || '14:00'
  const timeSaida         = process.env.ALERT_TIME_SAIDA          || '18:30'

  const toCron = (hhmm: string) => {
    const [h, m] = hhmm.split(':')
    return `${parseInt(m)} ${parseInt(h)} * * 1-5`
  }

  const tz = { timezone: 'America/Recife' }

  cron.schedule(toCron(timeEntrada),       () => checkMissedPunch('ENTRADA'),        tz)
  cron.schedule(toCron(timeSaidaAlmoco),   () => checkMissedPunch('SAIDA_ALMOCO'),   tz)
  cron.schedule(toCron(timeRetornoAlmoco), () => checkMissedPunch('RETORNO_ALMOCO'), tz)
  cron.schedule(toCron(timeSaida),         () => checkMissedPunch('SAIDA'),          tz)

  console.log(`[punch-alerts] Alertas agendados — Entrada: ${timeEntrada} | Almoço: ${timeSaidaAlmoco} | Retorno: ${timeRetornoAlmoco} | Saída: ${timeSaida} (BRT, seg-sex)`)
}
