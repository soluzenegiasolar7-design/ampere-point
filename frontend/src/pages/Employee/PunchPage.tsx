import { useState, useEffect, useRef } from 'react'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { useSocket } from '../../hooks/useSocket'
import { useGPS } from '../../hooks/useGPS'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002'

const PUNCH_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  ENTRADA:        { label: 'Entrada',        color: 'bg-green-600 hover:bg-green-700',   icon: '🟢' },
  SAIDA_ALMOCO:   { label: 'Saída Almoço',   color: 'bg-yellow-600 hover:bg-yellow-700', icon: '🍽️' },
  RETORNO_ALMOCO: { label: 'Retorno Almoço', color: 'bg-blue-600 hover:bg-blue-700',     icon: '🔵' },
  SAIDA:          { label: 'Saída',          color: 'bg-red-600 hover:bg-red-700',        icon: '🔴' },
}

type Step = 'idle' | 'selfie' | 'odo-form' | 'odo-camera'

export default function PunchPage() {
  const { user, logout } = useAuthStore()
  const [nextPunch, setNextPunch] = useState<string | null>(null)
  const [entries, setEntries]     = useState<any[]>([])
  const [workDay, setWorkDay]     = useState<any>(null)
  const [loading, setLoading]     = useState(false)
  const [step, setStep]           = useState<Step>('idle')
  const [success, setSuccess]     = useState('')
  const [error, setError]         = useState('')

  // selfie
  const selfieVideoRef  = useRef<HTMLVideoElement>(null)
  const selfieCanvasRef = useRef<HTMLCanvasElement>(null)
  const selfieStreamRef = useRef<MediaStream | null>(null)

  // odômetro
  const [odoKm, setOdoKm]           = useState('')
  const [odoPhotoTaken, setOdoPhotoTaken] = useState(false)
  const [odoLoading, setOdoLoading] = useState(false)
  const odoBlob     = useRef<Blob | null>(null)
  const odoVideoRef  = useRef<HTMLVideoElement>(null)
  const odoCanvasRef = useRef<HTMLCanvasElement>(null)
  const odoStreamRef = useRef<MediaStream | null>(null)

  const isWorking = nextPunch === 'SAIDA_ALMOCO' || nextPunch === 'SAIDA'
  useSocket(user?.role)
  useGPS(isWorking)

  const loadData = async () => {
    const [nextRes, entriesRes, wdRes] = await Promise.all([
      api.get('/api/time-entries/next'),
      api.get('/api/time-entries/today'),
      api.get('/api/work-days/my'),
    ])
    setNextPunch(nextRes.data.next)
    setEntries(entriesRes.data)
    const today = new Date().toISOString().slice(0, 10)
    const wd = wdRes.data.find((d: any) => d.date.slice(0, 10) === today) ?? null
    setWorkDay(wd)
    if (wd?.odometerKm != null) setOdoKm(String(wd.odometerKm))
  }

  useEffect(() => { loadData() }, [])

  const stopStream = (ref: React.MutableRefObject<MediaStream | null>) => {
    ref.current?.getTracks().forEach(t => t.stop())
    ref.current = null
  }

  const openCam = async (
    vRef: React.RefObject<HTMLVideoElement | null>,
    sRef: React.MutableRefObject<MediaStream | null>,
    facing: 'user' | 'environment' = 'user',
  ) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } })
      sRef.current = stream
      if (vRef.current) vRef.current.srcObject = stream
    } catch { setError('Não foi possível acessar a câmera') }
  }

  const captureBlob = (
    vRef: React.RefObject<HTMLVideoElement | null>,
    cRef: React.RefObject<HTMLCanvasElement | null>,
  ): Promise<Blob | null> => new Promise(resolve => {
    if (!vRef.current || !cRef.current) return resolve(null)
    const c = cRef.current
    c.width = vRef.current.videoWidth; c.height = vRef.current.videoHeight
    c.getContext('2d')!.drawImage(vRef.current, 0, 0)
    c.toBlob(resolve, 'image/jpeg', 0.8)
  })

  // ── SELFIE ──
  const handlePunchClick = () => {
    setError('')
    setStep('selfie')
    openCam(selfieVideoRef, selfieStreamRef, 'user')
  }

  const captureAndPunch = async () => {
    setLoading(true); setError('')
    const blob = await captureBlob(selfieVideoRef, selfieCanvasRef)
    stopStream(selfieStreamRef)

    const pos = await new Promise<GeolocationPosition>((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true })
    ).catch(() => null)

    const form = new FormData()
    form.append('type',      nextPunch!)
    form.append('latitude',  String(pos?.coords.latitude  ?? -5.7945))
    form.append('longitude', String(pos?.coords.longitude ?? -35.2110))
    if (pos)  form.append('accuracy', String(pos.coords.accuracy))
    if (blob) form.append('photo', blob, 'selfie.jpg')

    try {
      const wasSaida = nextPunch === 'SAIDA'
      await api.post('/api/time-entries', form)
      await loadData()
      if (wasSaida) {
        // Odômetro obrigatório na saída — abre o formulário automaticamente
        setOdoKm(''); odoBlob.current = null; setOdoPhotoTaken(false)
        setStep('odo-form')
      } else {
        setSuccess(`${PUNCH_LABELS[nextPunch!]?.label} registrada!`)
        setStep('idle')
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erro ao registrar ponto')
      setStep('idle')
    } finally { setLoading(false) }
  }

  // ── ODÔMETRO ──
  const openOdoCamera = async () => {
    setStep('odo-camera')
    await openCam(odoVideoRef, odoStreamRef, 'environment')
  }

  const captureOdoPhoto = async () => {
    const blob = await captureBlob(odoVideoRef, odoCanvasRef)
    odoBlob.current = blob
    setOdoPhotoTaken(!!blob)
    stopStream(odoStreamRef)
    setStep('odo-form')
  }

  const submitOdometer = async () => {
    if (!odoKm || isNaN(Number(odoKm))) { setError('Informe os km rodados hoje'); return }
    setOdoLoading(true); setError('')
    const form = new FormData()
    form.append('odometerKm', odoKm)
    if (odoBlob.current) form.append('odometerPhoto', odoBlob.current, 'odometer.jpg')
    try {
      await api.patch('/api/work-days/today/odometer', form)
      setSuccess('Quilometragem registrada!')
      setStep('idle')
      await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erro ao salvar')
    } finally { setOdoLoading(false) }
  }

  const cancelFlow = () => {
    stopStream(selfieStreamRef); stopStream(odoStreamRef); setStep('idle'); setError('')
  }

  const fmt = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const hasPunched = entries.length > 0

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex justify-between items-center">
        <div>
          <span className="text-lg font-bold">⚡ AmperePoint</span>
          <p className="text-gray-400 text-xs">{user?.name} · {user?.unit}</p>
        </div>
        <button onClick={logout} className="text-gray-400 text-sm hover:text-white">Sair</button>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Data */}
        <div className="text-center my-4">
          <p className="text-gray-400 text-sm">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="text-3xl font-bold mt-1">
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {success && (
          <div className="bg-green-900/30 border border-green-700 text-green-400 rounded-xl p-3 text-center">
            {success}
          </div>
        )}
        {error && step === 'idle' && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-xl p-3 text-center">
            {error}
          </div>
        )}

        {/* Botão de ponto */}
        {nextPunch ? (
          <button
            onClick={handlePunchClick}
            className={`w-full py-6 rounded-2xl text-white font-bold text-xl ${PUNCH_LABELS[nextPunch]?.color} transition-colors`}
          >
            {PUNCH_LABELS[nextPunch]?.icon} Bater {PUNCH_LABELS[nextPunch]?.label}
          </button>
        ) : (
          <div className="w-full py-6 rounded-2xl bg-gray-800 text-gray-400 font-bold text-xl text-center">
            ✅ Todos os pontos registrados
          </div>
        )}

        {/* Resumo GPS do dia */}
        {workDay && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 flex justify-around">
            <div className="text-center">
              <p className="text-blue-400 font-bold text-xl">{workDay.totalKm.toFixed(1)} km</p>
              <p className="text-gray-500 text-xs mt-1">GPS registrado</p>
            </div>
            <div className="w-px bg-gray-700" />
            <div className="text-center">
              <p className="text-green-400 font-bold text-xl">
                {Math.floor(workDay.totalMinutes / 60)}h{String(workDay.totalMinutes % 60).padStart(2, '0')}m
              </p>
              <p className="text-gray-500 text-xs mt-1">Tempo trabalhado</p>
            </div>
          </div>
        )}

        {/* Card de quilometragem do tacômetro */}
        {hasPunched && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-200 text-sm">🚗 Quilometragem do dia</h2>
              {workDay?.odometerKm != null && (
                <span className="text-xs text-green-400 font-semibold">✓ Registrado</span>
              )}
            </div>

            {workDay?.odometerKm != null ? (
              <>
                {/* comparação */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-purple-400 font-bold text-lg">{Number(workDay.odometerKm).toFixed(0)} km</p>
                    <p className="text-gray-500 text-xs mt-0.5">Você informou</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-blue-400 font-bold text-lg">{workDay ? workDay.totalKm.toFixed(1) : '—'} km</p>
                    <p className="text-gray-500 text-xs mt-0.5">Sistema GPS</p>
                  </div>
                </div>
                {/* diferença */}
                {workDay && (() => {
                  const diff = Math.abs(Number(workDay.odometerKm) - workDay.totalKm)
                  const pct  = workDay.totalKm > 0 ? (diff / workDay.totalKm) * 100 : 0
                  return (
                    <p className={`text-xs text-center ${pct > 15 ? 'text-yellow-400' : 'text-gray-500'}`}>
                      Diferença: {diff.toFixed(1)} km {pct > 15 ? '⚠️ Verificar' : '✓ Ok'}
                    </p>
                  )
                })()}
                {/* foto se disponível */}
                {workDay.odometerPhotoUrl && (
                  <img
                    src={`${API_URL}${workDay.odometerPhotoUrl}`}
                    alt="Tacômetro"
                    className="w-full rounded-xl mt-3 object-cover max-h-32"
                  />
                )}
                <button
                  onClick={() => { setOdoKm(String(workDay.odometerKm)); odoBlob.current = null; setOdoPhotoTaken(false); setStep('odo-form') }}
                  className="w-full mt-3 py-2 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  ✏️ Atualizar
                </button>
              </>
            ) : (
              <button
                onClick={() => { setOdoKm(''); odoBlob.current = null; setOdoPhotoTaken(false); setStep('odo-form') }}
                className="w-full py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 border-dashed rounded-xl text-gray-400 hover:text-white transition-colors text-sm"
              >
                📷 Registrar km do tacômetro
              </button>
            )}
          </div>
        )}

        {/* Histórico de pontos */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <h2 className="font-semibold text-gray-300 mb-3 text-sm">Pontos de hoje</h2>
          {entries.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">Nenhum ponto registrado</p>
          ) : (
            <div className="space-y-3">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{PUNCH_LABELS[e.type]?.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{PUNCH_LABELS[e.type]?.label}</p>
                      {e.photoUrl && <p className="text-xs text-gray-500">📷 Com foto</p>}
                    </div>
                  </div>
                  <span className="text-green-400 font-mono font-bold">{fmt(e.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL SELFIE ── */}
      {step === 'selfie' && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex justify-between items-center p-4">
            <p className="text-white font-semibold">Tire sua selfie para confirmar</p>
            <button onClick={cancelFlow} className="text-gray-400 text-2xl">✕</button>
          </div>
          <video ref={selfieVideoRef} autoPlay playsInline className="flex-1 object-cover" />
          <canvas ref={selfieCanvasRef} className="hidden" />
          <div className="p-6">
            <button
              onClick={captureAndPunch}
              disabled={loading}
              className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-2xl text-white font-bold text-lg"
            >
              {loading ? 'Registrando...' : '📸 Confirmar Ponto'}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL ODÔMETRO — FORMULÁRIO ── */}
      {step === 'odo-form' && (
        <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
          <div className="flex justify-between items-center p-4 bg-gray-900 border-b border-gray-800">
            <div>
              <p className="text-white font-bold">🚗 Quilometragem do dia</p>
              {nextPunch === null && entries.some(e => e.type === 'SAIDA') && (
                <p className="text-yellow-400 text-xs mt-0.5">⚠ Obrigatório para concluir a saída</p>
              )}
            </div>
            <button onClick={cancelFlow} className="text-gray-400 text-2xl">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            {error && (
              <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-xl p-3 text-sm">{error}</div>
            )}

            <div>
              <label className="text-gray-400 text-sm block mb-2">Quantos km você rodou hoje? *</label>
              <input
                type="number"
                inputMode="decimal"
                value={odoKm}
                onChange={e => setOdoKm(e.target.value)}
                placeholder="Ex: 120"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-white text-2xl font-bold placeholder-gray-600 focus:outline-none focus:border-green-500 text-center"
              />
              {workDay?.totalKm > 0 && (
                <p className="text-xs text-gray-500 text-center mt-2">
                  Sistema GPS registrou {workDay.totalKm.toFixed(1)} km
                </p>
              )}
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-2">Foto do tacômetro</label>
              {odoPhotoTaken ? (
                <div className="flex items-center gap-3 bg-green-900/20 border border-green-700 rounded-xl px-4 py-3">
                  <span className="text-green-400 text-xl">✅</span>
                  <p className="flex-1 text-green-400 text-sm font-semibold">Foto capturada</p>
                  <button onClick={openOdoCamera} className="text-xs text-gray-400 hover:text-white">Refazer</button>
                </div>
              ) : (
                <button
                  onClick={openOdoCamera}
                  className="w-full py-5 bg-gray-800 hover:bg-gray-700 border border-gray-700 border-dashed rounded-xl text-gray-400 hover:text-white transition-colors"
                >
                  📷 Tirar foto do tacômetro
                </button>
              )}
            </div>

            <button
              onClick={submitOdometer}
              disabled={odoLoading}
              className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-2xl text-white font-bold text-lg mt-auto"
            >
              {odoLoading ? 'Salvando...' : '✓ Confirmar quilometragem'}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL ODÔMETRO — CÂMERA ── */}
      {step === 'odo-camera' && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex justify-between items-center p-4">
            <p className="text-white font-semibold">Aponte para o tacômetro</p>
            <button onClick={() => { stopStream(odoStreamRef); setStep('odo-form') }} className="text-gray-400 text-2xl">✕</button>
          </div>
          <video ref={odoVideoRef} autoPlay playsInline className="flex-1 object-cover" />
          <canvas ref={odoCanvasRef} className="hidden" />
          <div className="p-6">
            <button
              onClick={captureOdoPhoto}
              className="w-full py-4 bg-green-600 hover:bg-green-700 rounded-2xl text-white font-bold text-lg"
            >
              📸 Capturar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
