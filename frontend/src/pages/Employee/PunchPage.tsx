import { useState, useEffect, useRef } from 'react'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { useSocket } from '../../hooks/useSocket'
import { useGPS } from '../../hooks/useGPS'

const PUNCH_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  ENTRADA: { label: 'Entrada', color: 'bg-green-600 hover:bg-green-700', icon: '🟢' },
  SAIDA_ALMOCO: { label: 'Saída Almoço', color: 'bg-yellow-600 hover:bg-yellow-700', icon: '🍽️' },
  RETORNO_ALMOCO: { label: 'Retorno Almoço', color: 'bg-blue-600 hover:bg-blue-700', icon: '🔵' },
  SAIDA: { label: 'Saída', color: 'bg-red-600 hover:bg-red-700', icon: '🔴' },
}

export default function PunchPage() {
  const { user, logout } = useAuthStore()
  const [nextPunch, setNextPunch] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const isWorking = nextPunch === 'SAIDA_ALMOCO' || nextPunch === 'SAIDA'
  useSocket(user?.role)
  useGPS(isWorking)

  const loadData = async () => {
    const [nextRes, entriesRes] = await Promise.all([
      api.get('/api/time-entries/next'),
      api.get('/api/time-entries/today'),
    ])
    setNextPunch(nextRes.data.next)
    setEntries(entriesRes.data)
  }

  useEffect(() => { loadData() }, [])

  const isSaida = nextPunch === 'SAIDA'

  const openCamera = async () => {
    setShowCamera(true)
    try {
      // SAIDA: câmera traseira para fotografar o odômetro
      // Demais pontos: câmera frontal (selfie)
      const facingMode = isSaida ? 'environment' : 'user'
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      setError('Não foi possível acessar a câmera')
      setShowCamera(false)
    }
  }

  const captureAndPunch = async () => {
    if (!videoRef.current || !canvasRef.current) return
    setLoading(true)
    setError('')

    const canvas = canvasRef.current
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) { setLoading(false); return }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      ).catch(() => null)

      const form = new FormData()
      form.append('type', nextPunch!)
      form.append('latitude', String(pos?.coords.latitude ?? -5.7945))
      form.append('longitude', String(pos?.coords.longitude ?? -35.2110))
      if (pos) form.append('accuracy', String(pos.coords.accuracy))
      form.append('photo', blob, 'selfie.jpg')

      try {
        await api.post('/api/time-entries', form)
        setSuccess(`${PUNCH_LABELS[nextPunch!]?.label} registrada!`)
        setShowCamera(false)
        streamRef.current?.getTracks().forEach(t => t.stop())
        await loadData()
        setTimeout(() => setSuccess(''), 3000)
      } catch (e: any) {
        setError(e.response?.data?.error || 'Erro ao registrar ponto')
      } finally {
        setLoading(false)
      }
    }, 'image/jpeg', 0.8)
  }

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    setShowCamera(false)
  }

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

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
          <p className="text-gray-400 text-sm">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p className="text-3xl font-bold mt-1" id="clock">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>

        {/* Alertas */}
        {success && <div className="bg-green-900/30 border border-green-700 text-green-400 rounded-xl p-3 mb-4 text-center">{success}</div>}
        {error && <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-xl p-3 mb-4 text-center">{error}</div>}

        {/* Botão de bater ponto */}
        {nextPunch ? (
          <button
            onClick={openCamera}
            className={`w-full py-6 rounded-2xl text-white font-bold text-xl ${PUNCH_LABELS[nextPunch]?.color} transition-colors mb-6`}
          >
            {PUNCH_LABELS[nextPunch]?.icon} Bater {PUNCH_LABELS[nextPunch]?.label}
          </button>
        ) : (
          <div className="w-full py-6 rounded-2xl bg-gray-800 text-gray-400 font-bold text-xl text-center mb-6">
            ✅ Todos os pontos registrados
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

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex justify-between items-center p-4">
            <div>
              <p className="text-white font-semibold">
                {isSaida ? '📷 Fotografe o odômetro' : '🤳 Tire sua selfie para confirmar'}
              </p>
              {isSaida && (
                <p className="text-gray-400 text-xs mt-1">Aponte a câmera para o painel do veículo</p>
              )}
            </div>
            <button onClick={closeCamera} className="text-gray-400 text-2xl">✕</button>
          </div>
          <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="p-6">
            <button
              onClick={captureAndPunch}
              disabled={loading}
              className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-2xl text-white font-bold text-lg"
            >
              {loading ? 'Registrando...' : isSaida ? '📸 Confirmar Saída com Odômetro' : '📸 Confirmar Ponto'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
