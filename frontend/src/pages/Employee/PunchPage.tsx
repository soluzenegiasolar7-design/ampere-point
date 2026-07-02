import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Zap, LogOut, Clock, CheckCircle2, Navigation,
  Camera, Car, AlertCircle, ChevronRight, RefreshCw, X,
  ChevronDown, FileText, Download, Sliders, TrendingUp
} from 'lucide-react'
import { api, photoUrl } from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { useSocket } from '../../hooks/useSocket'
import { useGPS } from '../../hooks/useGPS'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'

type PunchType = 'ENTRADA' | 'SAIDA_ALMOCO' | 'RETORNO_ALMOCO' | 'SAIDA'
type Step = 'idle' | 'selfie' | 'odo-form' | 'odo-camera'

const PUNCH_CONFIG: Record<PunchType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  ENTRADA:        { label: 'Registrar Entrada',  color: 'text-emerald-400', bg: 'bg-emerald-500',  icon: <CheckCircle2 size={22} /> },
  SAIDA_ALMOCO:   { label: 'Saída para Almoço',  color: 'text-amber-400',   bg: 'bg-amber-500',    icon: <Clock size={22} /> },
  RETORNO_ALMOCO: { label: 'Retorno do Almoço',  color: 'text-blue-400',    bg: 'bg-blue-500',     icon: <RefreshCw size={22} /> },
  SAIDA:          { label: 'Registrar Saída',    color: 'text-rose-400',    bg: 'bg-rose-500',     icon: <LogOut size={22} /> },
}

const PUNCH_BADGE: Record<PunchType, { label: string; variant: 'success' | 'warning' | 'info' | 'danger' }> = {
  ENTRADA:        { label: 'Entrada',        variant: 'success' },
  SAIDA_ALMOCO:   { label: 'Saída Almoço',   variant: 'warning' },
  RETORNO_ALMOCO: { label: 'Retorno Almoço', variant: 'info' },
  SAIDA:          { label: 'Saída',          variant: 'danger' },
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function useRealtimeClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

function useCamera(facing: 'user' | 'environment' = 'user') {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(async () => {
    setError(null)
    setReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => setReady(true)
      }
    } catch {
      setError('Não foi possível acessar a câmera. Verifique as permissões.')
    }
  }, [facing])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  const capture = useCallback((): Promise<Blob | null> => new Promise(resolve => {
    if (!videoRef.current || !canvasRef.current) return resolve(null)
    const c = canvasRef.current
    c.width = videoRef.current.videoWidth
    c.height = videoRef.current.videoHeight
    c.getContext('2d')!.drawImage(videoRef.current, 0, 0)
    c.toBlob(resolve, 'image/jpeg', 0.85)
  }), [])

  useEffect(() => () => { stop() }, [stop])

  return { videoRef, canvasRef, ready, error, start, stop, capture }
}

export default function PunchPage() {
  const { user, logout } = useAuthStore()
  const now = useRealtimeClock()

  const [nextPunch, setNextPunch] = useState<PunchType | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [workDay, setWorkDay] = useState<any>(null)
  const [step, setStep] = useState<Step>('idle')
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const [meusDadosOpen, setMeusDadosOpen] = useState(false)
  const [payslips, setPayslips] = useState<any[]>([])
  const [hourBank, setHourBank] = useState<any>(null)
  const [hrLoading, setHrLoading] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ date: '', punchType: 'ENTRADA', requestedTime: '', reason: '' })
  const [adjustLoading, setAdjustLoading] = useState(false)

  // odômetro
  const [odoKm, setOdoKm] = useState('')
  const [odoPhotoBlob, setOdoPhotoBlob] = useState<Blob | null>(null)
  const [odoLoading, setOdoLoading] = useState(false)

  const selfie = useCamera('user')
  const odo = useCamera('environment')

  const hasEntrada = entries.some((e: any) => e.type === 'ENTRADA')
  const hasSaida   = entries.some((e: any) => e.type === 'SAIDA')
  const isWorking  = hasEntrada && !hasSaida
  useSocket(user?.role)
  useGPS(isWorking)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const loadData = useCallback(async () => {
    try {
      const [nextRes, entriesRes, wdRes] = await Promise.all([
        api.get('/api/time-entries/next'),
        api.get('/api/time-entries/today'),
        api.get('/api/work-days/my'),
      ])
      setNextPunch(nextRes.data.next)
      setEntries(entriesRes.data)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' })
      const wd = wdRes.data.find((d: any) => d.date.slice(0, 10) === today) ?? null
      setWorkDay(wd)
      if (wd?.odometerKm != null) setOdoKm(String(wd.odometerKm))
    } catch {
      showToast('error', 'Erro ao carregar dados')
    } finally {
      setDataLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const loadHRData = useCallback(async () => {
    setHrLoading(true)
    try {
      const [payslipsRes, hourBankRes] = await Promise.all([
        api.get('/api/payslips/my'),
        api.get('/api/hour-bank/my'),
      ])
      setPayslips(payslipsRes.data)
      setHourBank(hourBankRes.data)
    } catch {
      // silent — toast only if user explicitly retries
    } finally {
      setHrLoading(false)
    }
  }, [])

  const prePunchOdo = useRef(false)

  // ── SELFIE FLOW ──
  const handlePunchClick = async () => {
    if (nextPunch === 'SAIDA') {
      prePunchOdo.current = true
      setOdoKm(''); setOdoPhotoBlob(null)
      setStep('odo-form')
    } else {
      prePunchOdo.current = false
      setStep('selfie')
      await selfie.start()
    }
  }

  const continueToSelfie = async () => {
    if (!odoKm || isNaN(Number(odoKm)) || Number(odoKm) < 0) {
      showToast('error', 'Informe os km rodados hoje')
      return
    }
    setStep('selfie')
    await selfie.start()
  }

  const captureAndPunch = async () => {
    setLoading(true)
    try {
      const blob = await selfie.capture()
      selfie.stop()

      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 })
      ).catch(() => null)

      if (!pos) {
        showToast('error', 'Não foi possível obter localização. Verifique se o GPS está ativo.')
        setStep('idle')
        return
      }

      const form = new FormData()
      form.append('type', nextPunch!)
      form.append('latitude',  String(pos.coords.latitude))
      form.append('longitude', String(pos.coords.longitude))
      form.append('accuracy',  String(pos.coords.accuracy))
      if (blob) form.append('photo', blob, 'selfie.jpg')

      await api.post('/api/time-entries', form)

      if (prePunchOdo.current && odoKm) {
        const odoForm = new FormData()
        odoForm.append('odometerKm', odoKm)
        if (odoPhotoBlob) odoForm.append('odometerPhoto', odoPhotoBlob, 'odometer.jpg')
        await api.patch('/api/work-days/today/odometer', odoForm).catch(() => {})
      }

      prePunchOdo.current = false
      await loadData()
      showToast('success', `${PUNCH_CONFIG[nextPunch!]?.label} registrado!`)
      setStep('idle')
    } catch (e: any) {
      selfie.stop()
      showToast('error', e.response?.data?.error || 'Erro ao registrar ponto')
      setStep('idle')
    } finally {
      setLoading(false)
    }
  }

  // ── ODÔMETRO FLOW ──
  const openOdoCamera = async () => {
    setStep('odo-camera')
    await odo.start()
  }

  const captureOdoPhoto = async () => {
    const blob = await odo.capture()
    odo.stop()
    setOdoPhotoBlob(blob)
    setStep('odo-form')
  }

  const submitOdometer = async () => {
    if (!odoKm || isNaN(Number(odoKm)) || Number(odoKm) < 0) {
      showToast('error', 'Informe os km rodados hoje')
      return
    }
    setOdoLoading(true)
    try {
      const form = new FormData()
      form.append('odometerKm', odoKm)
      if (odoPhotoBlob) form.append('odometerPhoto', odoPhotoBlob, 'odometer.jpg')
      await api.patch('/api/work-days/today/odometer', form)
      showToast('success', 'Quilometragem registrada com sucesso!')
      setStep('idle')
      await loadData()
    } catch (e: any) {
      showToast('error', e.response?.data?.message || 'Erro ao salvar quilometragem')
    } finally {
      setOdoLoading(false)
    }
  }

  const cancelFlow = () => {
    selfie.stop()
    odo.stop()
    setStep('idle')
  }

  const downloadPayslip = async (id: string, fileName: string) => {
    try {
      const res = await api.get(`/api/payslips/${id}/file`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName || `holerite-${id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showToast('error', 'Erro ao baixar holerite')
    }
  }

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (adjustForm.reason.length < 10) {
      showToast('error', 'Motivo deve ter pelo menos 10 caracteres')
      return
    }
    setAdjustLoading(true)
    try {
      await api.post('/api/time-adjustments', {
        date: adjustForm.date,
        punchType: adjustForm.punchType,
        requestedTime: adjustForm.requestedTime,
        reason: adjustForm.reason,
      })
      showToast('success', 'Solicitação de ajuste enviada!')
      setAdjustForm({ date: '', punchType: 'ENTRADA', requestedTime: '', reason: '' })
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Erro ao enviar solicitação')
    } finally {
      setAdjustLoading(false)
    }
  }

  const fmt = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (dataLoading) return (
    <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Spinner size="lg" className="text-amber-500" />
        <p className="text-sm">Carregando...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#080c14] text-white pb-8">
      {/* Header */}
      <header className="bg-slate-900/80 border-b border-slate-800 px-4 py-3 flex items-center justify-between backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <Zap size={18} className="text-gray-950 fill-gray-950" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">{user?.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user?.unit}</p>
          </div>
        </div>
        <button onClick={logout} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-500/10">
          <LogOut size={14} />
          Sair
        </button>
      </header>

      <div className="max-w-md mx-auto px-4 pt-6 space-y-4">
        {/* Relógio */}
        <div className="text-center py-2">
          <p className="text-5xl font-bold text-white tabular-nums tracking-tight">
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-slate-500 text-sm mt-2 capitalize">
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {toast.msg}
          </div>
        )}

        {/* Botão Principal de Ponto */}
        {nextPunch ? (
          <button
            onClick={handlePunchClick}
            className={`w-full py-5 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg ${PUNCH_CONFIG[nextPunch].bg} hover:opacity-90`}
          >
            {PUNCH_CONFIG[nextPunch].icon}
            {PUNCH_CONFIG[nextPunch].label}
            <ChevronRight size={20} className="ml-auto opacity-70" />
          </button>
        ) : (
          <div className="w-full py-5 rounded-2xl bg-slate-800/50 border border-slate-700 flex items-center justify-center gap-3 text-slate-400">
            <CheckCircle2 size={22} className="text-emerald-500" />
            <span className="font-semibold">Expediente encerrado</span>
          </div>
        )}

        {/* GPS ativo */}
        {isWorking && (
          <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
            <Navigation size={18} className="text-blue-400 animate-pulse shrink-0" />
            <div>
              <p className="text-blue-300 text-xs font-semibold">Rastreamento GPS ativo</p>
              <p className="text-blue-500/70 text-xs">Mantenha o app aberto durante o trabalho</p>
            </div>
          </div>
        )}

        {/* Métricas do dia */}
        {workDay && entries.length > 0 && (
          <Card className="p-4 text-center">
            <Clock size={16} className="text-emerald-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-emerald-400">
              {Math.floor(workDay.totalMinutes / 60)}h{String(workDay.totalMinutes % 60).padStart(2, '0')}m
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Tempo trabalhado</p>
          </Card>
        )}

        {/* Card odômetro */}
        {entries.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Car size={16} className="text-amber-400" />
                <span className="text-sm font-semibold text-slate-200">Quilometragem do dia</span>
              </div>
              {workDay?.odometerKm != null && (
                <Badge variant="success"><CheckCircle2 size={11} /> Registrado</Badge>
              )}
            </div>

            {workDay?.odometerKm != null ? (
              <>
                <div className="bg-slate-800 rounded-xl p-3 text-center mb-3">
                  <p className="text-purple-400 font-bold text-2xl">{Number(workDay.odometerKm).toFixed(0)} km</p>
                  <p className="text-slate-500 text-xs mt-0.5">Informado</p>
                </div>
                {workDay.odometerPhotoUrl && (
                  <img src={photoUrl(workDay.odometerPhotoUrl)} alt="Odômetro" className="w-full rounded-xl object-cover max-h-28 mb-3" />
                )}
                <button
                  onClick={() => { setOdoKm(String(workDay.odometerKm)); setOdoPhotoBlob(null); setStep('odo-form') }}
                  className="w-full py-2 text-xs text-slate-500 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Atualizar quilometragem
                </button>
              </>
            ) : (
              <button
                onClick={() => { setOdoKm(''); setOdoPhotoBlob(null); setStep('odo-form') }}
                className="w-full py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 border-dashed rounded-xl text-slate-400 hover:text-white transition-colors text-sm flex items-center justify-center gap-2"
              >
                <Camera size={16} /> Registrar quilometragem
              </button>
            )}
          </Card>
        )}

        {/* Histórico do dia */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Clock size={15} className="text-slate-500" /> Pontos de hoje
          </h3>
          {entries.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-3">Nenhum ponto registrado</p>
          ) : (
            <div className="space-y-2.5">
              {entries.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={PUNCH_BADGE[e.type as PunchType]?.variant ?? 'default'}>
                      {PUNCH_BADGE[e.type as PunchType]?.label ?? e.type}
                    </Badge>
                    {e.photoUrl && <span className="text-xs text-slate-600 flex items-center gap-1"><Camera size={11} /> foto</span>}
                  </div>
                  <span className="text-emerald-400 font-mono font-bold text-sm tabular-nums">{fmt(e.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Meus Dados */}
        <Card className="p-4">
          <button
            onClick={() => { const opening = !meusDadosOpen; setMeusDadosOpen(opening); if (opening) loadHRData() }}
            className="w-full flex items-center justify-between"
          >
            <span className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <FileText size={15} className="text-amber-400" /> Meus Dados
            </span>
            <ChevronDown size={16} className={`text-slate-500 transition-transform duration-200 ${meusDadosOpen ? 'rotate-180' : ''}`} />
          </button>

          {meusDadosOpen && (
            <div className="mt-4 space-y-5">
              {hrLoading ? (
                <div className="flex justify-center py-4">
                  <Spinner size="lg" className="text-amber-500" />
                </div>
              ) : (
                <>
                  {/* Banco de Horas */}
                  {hourBank && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <TrendingUp size={13} /> Banco de Horas (mês atual)
                      </p>
                      <div className="bg-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-500">Trabalhado</p>
                          <p className="text-white font-bold text-sm">{hourBank.totalWorkedHours}h</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500">Esperado</p>
                          <p className="text-white font-bold text-sm">{hourBank.totalExpectedHours}h</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Saldo</p>
                          <p className={`text-xl font-bold ${hourBank.balanceHours >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {hourBank.balanceLabel}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Holerites */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <FileText size={13} /> Holerites
                    </p>
                    {payslips.length === 0 ? (
                      <p className="text-slate-600 text-sm text-center py-2">Nenhum holerite disponível</p>
                    ) : (
                      <div className="space-y-2">
                        {payslips.map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                            <span className="text-sm text-slate-300">{MONTHS[p.month - 1]} / {p.year}</span>
                            <button
                              onClick={() => downloadPayslip(p.id, p.fileName)}
                              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                            >
                              <Download size={13} /> Baixar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ajuste de Ponto */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Sliders size={13} /> Solicitar Ajuste de Ponto
                    </p>
                    <form onSubmit={submitAdjustment} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1.5">Data *</label>
                          <input
                            type="date" required
                            value={adjustForm.date}
                            onChange={e => setAdjustForm(f => ({ ...f, date: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1.5">Tipo *</label>
                          <select
                            value={adjustForm.punchType}
                            onChange={e => setAdjustForm(f => ({ ...f, punchType: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                          >
                            <option value="ENTRADA">Entrada</option>
                            <option value="SAIDA_ALMOCO">Saída Almoço</option>
                            <option value="RETORNO_ALMOCO">Retorno Almoço</option>
                            <option value="SAIDA">Saída</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1.5">Horário correto *</label>
                        <input
                          type="time" required
                          value={adjustForm.requestedTime}
                          onChange={e => setAdjustForm(f => ({ ...f, requestedTime: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1.5">Motivo * <span className="text-slate-600">(mín. 10 caracteres)</span></label>
                        <textarea
                          required minLength={10} rows={2}
                          value={adjustForm.reason}
                          onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                          placeholder="Descreva o motivo do ajuste..."
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors resize-none placeholder-slate-600"
                        />
                      </div>
                      <Button type="submit" fullWidth loading={adjustLoading} size="sm">
                        <Sliders size={14} /> Enviar Solicitação
                      </Button>
                    </form>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ── MODAL SELFIE ── */}
      {step === 'selfie' && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <p className="text-white font-semibold text-sm">Tire sua selfie para confirmar</p>
            <button onClick={cancelFlow} className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"><X size={20} /></button>
          </div>

          {selfie.error ? (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="text-center">
                <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
                <p className="text-red-400 mb-4 text-sm">{selfie.error}</p>
                <Button variant="secondary" onClick={cancelFlow}>Voltar</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 relative overflow-hidden">
                <video ref={selfie.videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                {!selfie.ready && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <Spinner size="lg" className="text-amber-500" />
                  </div>
                )}
                <canvas ref={selfie.canvasRef} className="hidden" />
              </div>
              <div className="p-5 bg-black/80">
                <Button
                  fullWidth size="lg" variant="success"
                  onClick={captureAndPunch}
                  loading={loading}
                  disabled={!selfie.ready}
                >
                  <Camera size={20} />
                  {loading ? 'Registrando...' : 'Confirmar e Bater Ponto'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── MODAL ODÔMETRO FORMULÁRIO ── */}
      {step === 'odo-form' && (
        <div className="fixed inset-0 bg-[#080c14] z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
            <div>
              <p className="text-white font-bold flex items-center gap-2">
                <Car size={18} className="text-amber-400" />
                Quilometragem do dia
                {prePunchOdo.current && <span className="text-amber-500/70 font-normal text-sm">— Passo 1 de 2</span>}
              </p>
              {prePunchOdo.current
                ? <p className="text-amber-500/80 text-xs mt-0.5">Informe os km antes de registrar a saída</p>
                : !workDay?.odometerKm && <p className="text-amber-500/80 text-xs mt-0.5">Necessário para encerrar a saída</p>
              }
            </div>
            <button onClick={cancelFlow} className="p-2 rounded-full hover:bg-slate-700 text-slate-400 transition-colors"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            {toast?.type === 'error' && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 text-sm">
                <AlertCircle size={15} /> {toast.msg}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-400 block mb-2">Km rodados hoje *</label>
              <input
                type="number" inputMode="decimal" placeholder="Ex: 120"
                value={odoKm} onChange={e => setOdoKm(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-5 text-white text-3xl font-bold placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 text-center transition-colors"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-400 block mb-2">Foto do odômetro <span className="text-slate-600">(opcional)</span></label>
              {odoPhotoBlob ? (
                <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                  <p className="flex-1 text-emerald-400 text-sm font-medium">Foto capturada</p>
                  <button onClick={openOdoCamera} className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors">Refazer</button>
                </div>
              ) : (
                <button onClick={openOdoCamera} className="w-full py-5 bg-slate-800 hover:bg-slate-700 border border-slate-700 border-dashed rounded-xl text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2 text-sm">
                  <Camera size={18} /> Tirar foto do odômetro
                </button>
              )}
            </div>

            {prePunchOdo.current ? (
              <Button fullWidth size="lg" onClick={continueToSelfie} className="mt-auto">
                <Camera size={18} />
                Continuar para selfie →
              </Button>
            ) : (
              <Button fullWidth size="lg" onClick={submitOdometer} loading={odoLoading} className="mt-auto">
                <CheckCircle2 size={18} />
                {odoLoading ? 'Salvando...' : 'Confirmar Quilometragem'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL CÂMERA ODÔMETRO ── */}
      {step === 'odo-camera' && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <p className="text-white font-semibold text-sm">Aponte para o odômetro</p>
            <button onClick={() => { odo.stop(); setStep('odo-form') }} className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"><X size={20} /></button>
          </div>

          {odo.error ? (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="text-center">
                <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
                <p className="text-red-400 mb-4 text-sm">{odo.error}</p>
                <Button variant="secondary" onClick={() => { odo.stop(); setStep('odo-form') }}>Voltar</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 relative overflow-hidden">
                <video ref={odo.videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                {!odo.ready && <div className="absolute inset-0 flex items-center justify-center bg-black"><Spinner size="lg" className="text-amber-500" /></div>}
                <canvas ref={odo.canvasRef} className="hidden" />
              </div>
              <div className="p-5 bg-black/80">
                <Button fullWidth size="lg" variant="primary" onClick={captureOdoPhoto} disabled={!odo.ready}>
                  <Camera size={20} /> Capturar Foto
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
