import { useEffect, useState } from 'react'
import { X, Camera, MapPin } from 'lucide-react'
import { api } from '../../services/api'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'

const API_URL = import.meta.env.VITE_API_URL || 'https://ampere-point-production.up.railway.app'

const PUNCH_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada', SAIDA_ALMOCO: 'Saída Almoço', RETORNO_ALMOCO: 'Retorno Almoço', SAIDA: 'Saída',
}
const PUNCH_BADGE: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
  ENTRADA: 'success', SAIDA_ALMOCO: 'warning', RETORNO_ALMOCO: 'info', SAIDA: 'danger',
}

interface Entry {
  id: string; type: string; timestamp: string
  latitude: number; longitude: number; photoUrl: string | null; address: string | null
}

interface Props {
  employee: { id: string; name: string; unit: string }
  onClose: () => void
}

export default function EmployeePunchesModal({ employee, onClose }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null)

  useEffect(() => {
    api.get(`/api/time-entries/user/${employee.id}`)
      .then(r => setEntries(r.data))
      .finally(() => setLoading(false))
  }, [employee.id])

  const fmt = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-sm" style={{ zIndex: 9999 }} onClick={onClose}>
      {zoomedPhoto && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/95 cursor-zoom-out" style={{ zIndex: 10000 }} onClick={() => setZoomedPhoto(null)}>
          <img src={zoomedPhoto} alt="Selfie ampliada" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        </div>
      )}

      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-lg mx-4 shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <p className="font-bold text-white">{employee.name}</p>
            <p className="text-xs text-slate-500">{employee.unit} · Pontos de hoje</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {loading && <div className="flex justify-center py-8"><Spinner className="text-amber-500" /></div>}
          {!loading && entries.length === 0 && (
            <p className="text-slate-600 text-sm text-center py-8">Nenhum ponto registrado hoje.</p>
          )}
          {!loading && entries.map((entry, i) => (
            <div key={entry.id} className="mb-3 bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
              <div className="flex justify-between items-center px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={PUNCH_BADGE[entry.type] ?? 'default'}>{PUNCH_LABELS[entry.type] ?? entry.type}</Badge>
                  <span className="text-slate-300 font-mono text-sm tabular-nums">{fmt(entry.timestamp)}</span>
                </div>
                <span className="text-xs text-slate-600">#{i + 1}</span>
              </div>
              {entry.photoUrl ? (
                <div className="cursor-zoom-in relative" onClick={() => setZoomedPhoto(`${API_URL}${entry.photoUrl}`)}>
                  <img src={`${API_URL}${entry.photoUrl}`} alt="Selfie" className="w-full object-cover max-h-52"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <p className="text-xs text-slate-500 text-center py-1.5">Toque para ampliar</p>
                </div>
              ) : (
                <div className="h-14 flex items-center justify-center text-slate-700 text-sm mx-4 mb-2 rounded-xl border border-slate-700 gap-2">
                  <Camera size={16} className="opacity-40" /> Sem foto
                </div>
              )}
              <div className="px-4 pb-3">
                {entry.address && <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1"><MapPin size={11} /> {entry.address}</p>}
                <a href={`https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-slate-700/50 px-3 py-1.5 rounded-lg transition-colors">
                  <MapPin size={12} /> Ver no Google Maps
                  <span className="text-slate-600">({entry.latitude.toFixed(4)}, {entry.longitude.toFixed(4)})</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
