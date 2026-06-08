import { useState, useEffect, useRef } from 'react'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { useSocket } from '../../hooks/useSocket'
import { useGPS } from '../../hooks/useGPS'

const PUNCH_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  ENTRADA:        { label: 'Entrada',        color: 'bg-green-600 hover:bg-green-700',  icon: '🟢' },
  SAIDA_ALMOCO:   { label: 'Saída Almoço',   color: 'bg-yellow-600 hover:bg-yellow-700', icon: '🍽️' },
  RETORNO_ALMOCO: { label: 'Retorno Almoço', color: 'bg-blue-600 hover:bg-blue-700',    icon: '🔵' },
  SAIDA:          { label: 'Saída',          color: 'bg-red-600 hover:bg-red-700',       icon: '🔴' },
}

type Step = 'idle' | 'odometer' | 'odometer-camera' | 'selfie'

export default function PunchPage() {
  const { user, logout } = useAuthStore()
  const [nextPunch, setNextPunch] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [workDay, setWorkDay] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // selfie
  const selfieVideoRef = useRef<HTMLVideoElement>(null)
  const selfieCanvasRef = useRef<HTMLCanvasElement>(null)
  const selfieStreamRef = useRef<MediaStream | null>(null)
  const selfieBlob = useRef<Blob | null>(null)

  // tacômetro
  const [odometerKm, setOdometerKm] = useState('')
  const odometerVideoRef = useRef<HTMLVideoElement>(null)
  const odometerCanvasRef = useRef<HTMLCanvasElement>(null)
  const odometerStreamRef = useRef<MediaStream | null>(null)
  const odometerBlob = useRef<Blob | null>(null)
  const [odometerPhotoTaken, setOdometerPhotoTaken] = useState(false)

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
    setWorkDay(wdRes.data.find((d: any) => d.date.slice(0, 10) === today) ?? null)
  }

  useEffect(() => { loadData() }, [])

  const stopStream = (ref: React.MutableRefObject<MediaStream | null>) => {
    ref.current?.getTracks().forEach(t => t.stop())
    ref.current = null
  }

  const openCamera = async (
    videoRef: React.RefObject<HTMLVideoElement | null>,
    streamRef: React.MutableRefObject<MediaStream | null>,
    facing: 'user' | 'environment' = 'user',
  ) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      setError('Não foi possível acessar a câmera')
    }
  }

  const captureBlob = (
    videoRef: React.RefObject<HTMLVideoElement | null>,
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
  ): Promise<Blob | null> => new Promise(resolve => {
    if (!videoRef.current || !canvasRef.current) return resolve(null)
    const canvas = canvasRef.current
    canvas.width  = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)
    canvas.toBlob(resolve, 'image/jpeg', 0.8)
  })

  // === fluxo de início ===
  const handlePunchClick = () => {
    setError('')
    if (nextPunch === 'SAIDA') {
      setOdometerKm('')
      odometerBlob.current = null
      setOdometerPhotoTaken(false)
      setStep('odometer')
    } else {
      openSelfie()
    }
  }

  // === passo 1: tacômetro (só SAIDA) ===
  const openOdometerCamera = async () => {
    setStep('odometer-camera')
    await openCamera(odometerVideoRef, odometerStreamRef, 'environment')
  }

  const captureOdometer = async () => {
    const blob = await captureBlob(odometerVideoRef, odometerCanvasRef)
    odometerBlob.current = blob
    setOdometerPhotoTaken(!!blob)
    stopStream(odometerStreamRef)
    setStep('odometer')
  }

  const confirmOdometerStep = () => {
    if (!odometerKm || isNaN(Number(odometerKm))) {
      setError('Informe a leitura do tacômetro em km')
      return
    }
    setError('')
    openSelfie()
  }

  // === passo 2: selfie ===
  const openSelfie = async () => {
    setStep('selfie')
    await openCamera(selfieVideoRef, selfieStreamRef, 'user')
  }

  // === passo final: envio ===
  const captureAndPunch = async () => {
    setLoading(true)
    setError('')

    const blob = await captureBlob(selfieVideoRef, selfieCanvasRef)
    stopStream(selfieStreamRef)

    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
    ).catch(() => null)

    // 1. envia ponto com selfie (upload.single — igual ao original)
    const form = new FormData()
    form.append('type',      nextPunch!)
    form.append('latitude',  String(pos?.coords.latitude  ?? -5.7945))
    form.append('longitude', String(pos?.coords.longitude ?? -35.2110))
    if (pos)  form.append('accuracy', String(pos.coords.accuracy))
    if (blob) form.append('photo', blob, 'selfie.jpg')

    try {
      const { data: entry } = await api.post('/api/time-entries', form)

      // 2. se SAIDA, envia tacômetro em chamada separada
      if (nextPunch === 'SAIDA' && (odometerBlob.current || odometerKm)) {
        const odoForm = new FormData()
        if (odometerKm)           odoForm.append('odometerKm', odometerKm)
        if (odometerBlob.current) odoForm.append('odometerPhoto', odometerBlob.current, 'odometer.jpg')
        await api.patch(`/api/time-entries/${entry.id}/odometer`, odoForm).catch(() => {})
      }

      setSuccess(`${PUNCH_LABELS[nextPunch!]?.label} registrada!`)
      setStep('idle')
      await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erro ao registrar ponto')
      setStep('idle')
    } finally {
      setLoading(false)
    }
  }

  const cancelFlow = () => {
    stopStream(selfieStreamRef)
    stopStream(odometerStreamRef)
    setStep('idle')
    setError('')
  }

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

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

      <div className="max-w-md mx-auto p-4">
        {/* Data */}
        <div className="text-center my-6">
          <p className="text-gray-400 text-sm">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="text-3xl font-bold mt-1">
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {success && (
          <div className="bg-green-900/30 border border-green-700 text-green-400 rounded-xl p-3 mb-4 text-center">
            {success}
          </div>
        )}
        {error && step === 'idle' && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-xl p-3 mb-4 text-center">
            {error}
          </div>
        )}

        {/* Botão de bater ponto */}
        {nextPunch ? (
          <button
            onClick={handlePunchClick}
            className={`w-full py-6 rounded-2xl text-white font-bold text-xl ${PUNCH_LABELS[nextPunch]?.color} transition-colors mb-6`}
          >
            {PUNCH_LABELS[nextPunch]?.icon} Bater {PUNCH_LABELS[nextPunch]?.label}
          </button>
        ) : (
          <div className="w-full py-6 rounded-2xl bg-gray-800 text-gray-400 font-bold text-xl text-center mb-6">
            ✅ Todos os pontos registrados
          </div>
        )}

        {/* Resumo do dia */}
        {workDay && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 flex justify-around mb-4">
            <div className="text-center">
              <p className="text-blue-400 font-bold text-xl">{workDay.totalKm.toFixed(1)} km</p>
              <p className="text-gray-500 text-xs mt-1">Percorrido hoje</p>
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

        {/* Histórico do dia */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <h2 className="font-semibold text-gray-300 mb-3">Pontos de hoje</h2>
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
                  <span className="text-green-400 font-mono font-bold">{formatTime(e.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL TACÔMETRO ── */}
      {(step === 'odometer' || step === 'odometer-camera') && (
        <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
          <div className="flex justify-between items-center p-4 bg-gray-900 border-b border-gray-800">
            <p className="text-white font-bold text-lg">🚗 Registro de saída</p>
            <button onClick={cancelFlow} className="text-gray-400 text-2xl">✕</button>
          </div>

          {step === 'odometer-camera' ? (
            <>
              <p className="text-gray-400 text-sm text-center pt-4 px-4">
                Aponte a câmera para o tacômetro do veículo
              </p>
              <video ref={odometerVideoRef} autoPlay playsInline className="flex-1 object-cover mt-2" />
              <canvas ref={odometerCanvasRef} className="hidden" />
              <div className="p-6 flex gap-3">
                <button
                  onClick={() => { stopStream(odometerStreamRef); setStep('odometer') }}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-2xl text-white font-semibold"
                >
                  Voltar
                </button>
                <button
                  onClick={captureOdometer}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-2xl text-white font-bold text-lg"
                >
                  📸 Capturar
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              {error && (
                <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-xl p-3 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="text-gray-400 text-sm block mb-2">Leitura do tacômetro (km) *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={odometerKm}
                  onChange={e => setOdometerKm(e.target.value)}
                  placeholder="Ex: 45230"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg placeholder-gray-600 focus:outline-none focus:border-green-500"
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm block mb-2">Foto do tacômetro</label>
                {odometerPhotoTaken ? (
                  <div className="flex items-center gap-3 bg-green-900/20 border border-green-700 rounded-xl px-4 py-3">
                    <span className="text-green-400 text-xl">✅</span>
                    <div className="flex-1">
                      <p className="text-green-400 text-sm font-semibold">Foto capturada</p>
                    </div>
                    <button
                      onClick={openOdometerCamera}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Refazer
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={openOdometerCamera}
                    className="w-full py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 border-dashed rounded-xl text-gray-400 hover:text-white transition-colors"
                  >
                    📷 Tirar foto do tacômetro
                  </button>
                )}
              </div>

              <button
                onClick={confirmOdometerStep}
                className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-2xl text-white font-bold text-lg mt-auto"
              >
                Próximo → Selfie de saída
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL SELFIE ── */}
      {step === 'selfie' && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex justify-between items-center p-4">
            <p className="text-white font-semibold">
              {nextPunch === 'SAIDA' ? 'Selfie de confirmação' : 'Tire sua selfie para confirmar'}
            </p>
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
    </div>
  )
}
