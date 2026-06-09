import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../../services/api'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002'

const PUNCH_LABELS: Record<string, { label: string; icon: string }> = {
  ENTRADA:        { label: 'Entrada',        icon: '🟢' },
  SAIDA_ALMOCO:   { label: 'Saída Almoço',   icon: '🟡' },
  RETORNO_ALMOCO: { label: 'Retorno Almoço', icon: '🔵' },
  SAIDA:          { label: 'Saída',          icon: '🔴' },
}

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
})

type WorkDayData = {
  totalKm: number
  totalMinutes: number
  status: string
  odometerKm?: number | null
  odometerPhotoUrl?: string | null
} | null

interface Props {
  employee: { id: string; name: string; unit?: string }
  date: string // YYYY-MM-DD (initial date)
  workDay?: WorkDayData
  onClose: () => void
}

const STANDARD_MINUTES = 8 * 60
const TODAY = new Date().toISOString().slice(0, 10)

export default function EmployeeDayModal({ employee, date, onClose }: Props) {
  const [currentDate, setCurrentDate] = useState(date)
  const [workDayData, setWorkDayData] = useState<WorkDayData>(null)
  const [punches, setPunches] = useState<any[]>([])
  const [trail, setTrail] = useState<[number, number][]>([])
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const mapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setMapReady(false)
      if (mapTimerRef.current) clearTimeout(mapTimerRef.current)
      try {
        const [pRes, tRes, wRes] = await Promise.all([
          api.get(`/api/time-entries/user/${employee.id}?date=${currentDate}`),
          api.get(`/api/gps-logs/trail/${employee.id}?date=${currentDate}`),
          api.get(`/api/work-days/user/${employee.id}?date=${currentDate}`),
        ])
        setPunches(pRes.data)
        setTrail(tRes.data.map((p: any) => [p.latitude, p.longitude] as [number, number]))
        setWorkDayData(wRes.data)
      } catch {
        // silently fail — show empty state
      } finally {
        setLoading(false)
        mapTimerRef.current = setTimeout(() => setMapReady(true), 100)
      }
    }
    load()
    return () => { if (mapTimerRef.current) clearTimeout(mapTimerRef.current) }
  }, [employee.id, currentDate])

  const goBack = () => {
    const d = new Date(currentDate + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    setCurrentDate(d.toISOString().slice(0, 10))
  }

  const goForward = () => {
    const d = new Date(currentDate + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    const next = d.toISOString().slice(0, 10)
    if (next > TODAY) return
    setCurrentDate(next)
  }

  const fmt = (ts: string) =>
    new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const extraMinutes = workDayData ? Math.max(0, workDayData.totalMinutes - STANDARD_MINUTES) : 0
  const mapCenter: [number, number] = trail.length > 0
    ? trail[Math.floor(trail.length / 2)]
    : [-5.7945, -35.2110]

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex justify-between items-start p-5 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">{employee.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={goBack}
                className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg px-2 py-0.5 text-sm transition-colors"
              >
                ◀
              </button>
              <p className="text-gray-400 text-sm">
                {employee.unit} · {new Date(currentDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <button
                onClick={goForward}
                disabled={currentDate >= TODAY}
                className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-2 py-0.5 text-sm transition-colors"
              >
                ▶
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">Carregando...</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* foto ampliada overlay */}
            {zoomedPhoto && (
              <div
                onClick={() => setZoomedPhoto(null)}
                className="fixed inset-0 bg-black/95 flex items-center justify-center cursor-zoom-out"
                style={{ zIndex: 10000 }}
              >
                <img src={zoomedPhoto} alt="Foto" className="max-w-full max-h-full rounded-xl" />
              </div>
            )}

            {/* resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-gray-800">
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-blue-400 font-bold text-xl">{workDayData ? workDayData.totalKm.toFixed(1) : '—'} km</p>
                <p className="text-gray-500 text-xs mt-1">GPS percorrido</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-purple-400 font-bold text-xl">
                  {workDayData?.odometerKm != null ? `${Number(workDayData.odometerKm).toFixed(0)} km` : '—'}
                </p>
                <p className="text-gray-500 text-xs mt-1">Tacômetro</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-green-400 font-bold text-xl">
                  {workDayData ? `${Math.floor(workDayData.totalMinutes / 60)}h${String(workDayData.totalMinutes % 60).padStart(2, '0')}m` : '—'}
                </p>
                <p className="text-gray-500 text-xs mt-1">Trabalhado</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                {extraMinutes > 0 ? (
                  <>
                    <p className="text-yellow-400 font-bold text-xl">
                      +{Math.floor(extraMinutes / 60)}h{String(extraMinutes % 60).padStart(2, '0')}m
                    </p>
                    <p className="text-gray-500 text-xs mt-1">Horas extras</p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 font-bold text-xl">—</p>
                    <p className="text-gray-500 text-xs mt-1">Horas extras</p>
                  </>
                )}
              </div>
            </div>

            {/* mapa com traçado */}
            {trail.length > 1 && mapReady && (
              <div className="p-5 border-b border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3">Traçado do dia</p>
                <div className="rounded-xl overflow-hidden" style={{ height: 220 }}>
                  <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }} key={`${employee.id}-${currentDate}`}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
                    <Polyline positions={trail} color="#4ade80" weight={3} opacity={0.85} />
                    {trail.length > 0 && <Marker position={trail[0]} icon={greenIcon} />}
                  </MapContainer>
                </div>
              </div>
            )}

            {/* pontos com fotos */}
            <div className="p-5">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3">Registros de ponto</p>
              {punches.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">Nenhum ponto registrado neste dia.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA'] as const).map(type => {
                    const punch = punches.find(p => p.type === type)
                    const lbl = PUNCH_LABELS[type]
                    return (
                      <div key={type} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
                        {punch?.photoUrl ? (
                          <div
                            className="cursor-zoom-in"
                            onClick={() => setZoomedPhoto(`${API_URL}${punch.photoUrl}`)}
                          >
                            <img
                              src={`${API_URL}${punch.photoUrl}`}
                              alt={lbl.label}
                              className="w-full object-cover"
                              style={{ height: 110 }}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center bg-gray-750 text-gray-600 text-2xl" style={{ height: 110 }}>
                            📷
                          </div>
                        )}
                        <div className="p-2">
                          <p className="text-xs font-semibold text-gray-300">{lbl.icon} {lbl.label}</p>
                          {punch ? (
                            <p className="text-green-400 font-mono text-sm font-bold">{fmt(punch.timestamp)}</p>
                          ) : (
                            <p className="text-gray-600 text-xs">Não registrado</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* foto do tacômetro */}
            {workDayData?.odometerPhotoUrl && (
              <div className="px-5 pb-5">
                <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3">Foto do tacômetro</p>
                <div
                  className="cursor-zoom-in inline-block rounded-xl overflow-hidden border border-gray-700"
                  onClick={() => setZoomedPhoto(`${API_URL}${workDayData.odometerPhotoUrl}`)}
                >
                  <img
                    src={`${API_URL}${workDayData.odometerPhotoUrl}`}
                    alt="Tacômetro"
                    className="max-h-48 object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
