import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { X, MapPin, Camera, Car, Clock, Navigation, ChevronLeft, ChevronRight } from 'lucide-react'
import { api, photoUrl } from '../../services/api'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'

const TODAY = new Date().toISOString().slice(0, 10)
const STANDARD_MINUTES = 8 * 60

const PUNCH_TYPES = ['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA'] as const
const PUNCH_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada', SAIDA_ALMOCO: 'Saída Almoço', RETORNO_ALMOCO: 'Retorno Almoço', SAIDA: 'Saída',
}
const PUNCH_BADGE: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
  ENTRADA: 'success', SAIDA_ALMOCO: 'warning', RETORNO_ALMOCO: 'info', SAIDA: 'danger',
}

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
})

type WorkDayData = {
  totalKm: number; totalMinutes: number; status: string
  odometerKm?: number | null; odometerPhotoUrl?: string | null
} | null

interface Props {
  employee: { id: string; name: string; unit?: string }
  date: string
  workDay?: WorkDayData
  onClose: () => void
}

export default function EmployeeDayModal({ employee, date, onClose }: Props) {
  const [currentDate, setCurrentDate] = useState(date)
  const [workDayData, setWorkDayData] = useState<WorkDayData>(null)
  const [punches, setPunches] = useState<any[]>([])
  const [trail, setTrail] = useState<[number, number][]>([])
  const [trailFull, setTrailFull] = useState<{ lat: number; lng: number; ts: number }[]>([])
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const mapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true); setMapReady(false)
      if (mapTimerRef.current) clearTimeout(mapTimerRef.current)
      try {
        const [pRes, tRes, wRes] = await Promise.all([
          api.get(`/api/time-entries/user/${employee.id}?date=${currentDate}`),
          api.get(`/api/gps-logs/trail/${employee.id}?date=${currentDate}`),
          api.get(`/api/work-days/user/${employee.id}?date=${currentDate}`),
        ])
        setPunches(pRes.data)
        const gpsPoints = tRes.data as any[]
        setTrail(gpsPoints.map((p) => [p.latitude, p.longitude] as [number, number]))
        setTrailFull(gpsPoints.map((p) => ({ lat: p.latitude, lng: p.longitude, ts: new Date(p.timestamp || p.ts || 0).getTime() })))
        setWorkDayData(wRes.data)
      } catch { /* show empty state */ }
      finally {
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

  const fmt = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const extraMinutes = workDayData ? Math.max(0, workDayData.totalMinutes - STANDARD_MINUTES) : 0
  const mapCenter: [number, number] = trail.length > 0 ? trail[Math.floor(trail.length / 2)] : [-5.7945, -35.2110]

  const lunchStats = (() => {
    const saidaAlmoco   = punches.find((p: any) => p.type === 'SAIDA_ALMOCO')
    const retornoAlmoco = punches.find((p: any) => p.type === 'RETORNO_ALMOCO')
    if (!saidaAlmoco || !retornoAlmoco || trailFull.length === 0) return null
    const t0 = new Date(saidaAlmoco.timestamp).getTime()
    const t1 = new Date(retornoAlmoco.timestamp).getTime()
    const lunchMinutes = Math.round((t1 - t0) / 60000)
    const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371; const dLat = (b.lat - a.lat) * Math.PI / 180; const dLng = (b.lng - a.lng) * Math.PI / 180
      const x = Math.sin(dLat/2)**2 + Math.cos(a.lat * Math.PI/180) * Math.cos(b.lat * Math.PI/180) * Math.sin(dLng/2)**2
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))
    }
    const lunchPoints = trailFull.filter(p => p.ts >= t0 && p.ts <= t1)
    let lunchKm = 0
    for (let i = 1; i < lunchPoints.length; i++) lunchKm += haversine(lunchPoints[i-1], lunchPoints[i])
    const effectiveMinutes = workDayData ? workDayData.totalMinutes : 0
    const effectiveKm = workDayData ? workDayData.totalKm - lunchKm : 0
    return { lunchMinutes, lunchKm, effectiveMinutes, effectiveKm }
  })()

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm" style={{ zIndex: 9999 }}>
      {zoomedPhoto && (
        <div onClick={() => setZoomedPhoto(null)} className="fixed inset-0 bg-black/95 flex items-center justify-center cursor-zoom-out" style={{ zIndex: 10000 }}>
          <button onClick={() => setZoomedPhoto(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"><X size={20} /></button>
          <img src={zoomedPhoto} alt="Foto ampliada" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        </div>
      )}

      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex justify-between items-start px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">{employee.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={goBack} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <p className="text-slate-500 text-sm">
                {employee.unit} · {new Date(currentDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <button onClick={goForward} disabled={currentDate >= TODAY}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner size="lg" className="text-amber-500" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-slate-800">
              {[
                { label: 'GPS percorrido', value: workDayData ? `${workDayData.totalKm.toFixed(1)} km` : '—', icon: <Navigation size={14} />, color: 'text-blue-400' },
                { label: 'Tacômetro', value: workDayData?.odometerKm != null ? `${Number(workDayData.odometerKm).toFixed(0)} km` : '—', icon: <Car size={14} />, color: 'text-amber-400' },
                { label: 'Trabalhado', value: workDayData ? `${Math.floor(workDayData.totalMinutes / 60)}h${String(workDayData.totalMinutes % 60).padStart(2, '0')}m` : '—', icon: <Clock size={14} />, color: 'text-emerald-400' },
                { label: 'Horas extras', value: extraMinutes > 0 ? `+${Math.floor(extraMinutes / 60)}h${String(extraMinutes % 60).padStart(2, '0')}m` : '—', icon: <Clock size={14} />, color: extraMinutes > 0 ? 'text-yellow-400' : 'text-slate-600' },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="bg-slate-800 rounded-xl p-3 text-center">
                  <div className={`flex items-center justify-center gap-1.5 mb-1 ${color}`}>
                    {icon}<span className="font-bold text-lg tabular-nums">{value}</span>
                  </div>
                  <p className="text-slate-500 text-xs">{label}</p>
                </div>
              ))}
            </div>

            {/* Efetivo vs Não efetivo */}
            {lunchStats && (
              <div className="px-5 pb-5 border-b border-slate-800">
                <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-3">Efetivo vs Não efetivo</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div />
                  <div className="font-semibold text-emerald-400">Efetivo</div>
                  <div className="font-semibold text-yellow-400">Não efetivo</div>
                  <div className="text-slate-500 flex items-center gap-1 justify-end"><Clock size={11} /> Tempo</div>
                  <div className="bg-slate-800 rounded-lg py-1.5 font-bold text-white tabular-nums">
                    {Math.floor(lunchStats.effectiveMinutes / 60)}h{String(lunchStats.effectiveMinutes % 60).padStart(2, '0')}m
                  </div>
                  <div className="bg-slate-800 rounded-lg py-1.5 font-bold text-yellow-300 tabular-nums">
                    {Math.floor(lunchStats.lunchMinutes / 60)}h{String(lunchStats.lunchMinutes % 60).padStart(2, '0')}m
                  </div>
                  <div className="text-slate-500 flex items-center gap-1 justify-end"><Navigation size={11} /> Km GPS</div>
                  <div className="bg-slate-800 rounded-lg py-1.5 font-bold text-white tabular-nums">
                    {Math.max(0, lunchStats.effectiveKm).toFixed(1)} km
                  </div>
                  <div className="bg-slate-800 rounded-lg py-1.5 font-bold text-yellow-300 tabular-nums">
                    {lunchStats.lunchKm.toFixed(1)} km
                  </div>
                </div>
              </div>
            )}

            {/* Mapa */}
            {trail.length > 1 && mapReady && (
              <div className="p-5 border-b border-slate-800">
                <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
                  <MapPin size={12} /> Traçado do dia
                </p>
                <div className="rounded-xl overflow-hidden" style={{ height: 200 }}>
                  <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }} key={`${employee.id}-${currentDate}`}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
                    <Polyline positions={trail} color="#f59e0b" weight={3} opacity={0.9} />
                    {trail.length > 0 && <Marker position={trail[0]} icon={greenIcon} />}
                  </MapContainer>
                </div>
              </div>
            )}

            {/* Pontos */}
            <div className="p-5">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
                <Camera size={12} /> Registros de ponto
              </p>
              {punches.length === 0 ? (
                <p className="text-slate-600 text-sm text-center py-6">Nenhum ponto registrado neste dia.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {PUNCH_TYPES.map(type => {
                    const punch = punches.find((p: any) => p.type === type)
                    return (
                      <div key={type} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                        {punch?.photoUrl ? (
                          <div className="cursor-zoom-in" onClick={() => setZoomedPhoto(photoUrl(punch.photoUrl))}>
                            <img src={photoUrl(punch.photoUrl)} alt={PUNCH_LABELS[type]} className="w-full object-cover" style={{ height: 100 }} />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center bg-slate-900 text-slate-700" style={{ height: 100 }}>
                            <Camera size={24} className="opacity-30" />
                          </div>
                        )}
                        <div className="p-2.5">
                          <Badge variant={PUNCH_BADGE[type]}>{PUNCH_LABELS[type]}</Badge>
                          {punch ? (
                            <p className="text-white font-mono text-sm font-bold mt-1.5 tabular-nums">{fmt(punch.timestamp)}</p>
                          ) : (
                            <p className="text-slate-600 text-xs mt-1.5">Não registrado</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Foto tacômetro */}
            {workDayData?.odometerPhotoUrl && (
              <div className="px-5 pb-5">
                <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
                  <Car size={12} /> Foto do tacômetro
                </p>
                <div className="cursor-zoom-in inline-block rounded-xl overflow-hidden border border-slate-700"
                  onClick={() => setZoomedPhoto(photoUrl(workDayData.odometerPhotoUrl!))}>
                  <img src={photoUrl(workDayData.odometerPhotoUrl!)} alt="Tacômetro" className="max-h-40 object-contain" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
