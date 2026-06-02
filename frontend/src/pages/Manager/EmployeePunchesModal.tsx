import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002'

const PUNCH_LABELS: Record<string, string> = {
  ENTRADA: '🟢 Entrada',
  SAIDA_ALMOCO: '🟡 Saída Almoço',
  RETORNO_ALMOCO: '🔵 Retorno Almoço',
  SAIDA: '🔴 Saída',
}

interface Entry {
  id: string
  type: string
  timestamp: string
  latitude: number
  longitude: number
  photoUrl: string | null
  address: string | null
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

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const mapsUrl = (lat: number, lng: number) =>
    `https://www.google.com/maps?q=${lat},${lng}`

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70" style={{zIndex:9999}} onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <p className="font-bold text-white">{employee.name}</p>
            <p className="text-xs text-gray-400">{employee.unit} · Pontos de hoje</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4">
          {loading && (
            <p className="text-gray-400 text-center py-8">Carregando...</p>
          )}

          {!loading && entries.length === 0 && (
            <p className="text-gray-500 text-center py-8">Nenhum ponto registrado hoje.</p>
          )}

          {!loading && entries.map((entry, i) => (
            <div key={entry.id} className="mb-4 bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
              {/* Topo da entrada */}
              <div className="flex justify-between items-center px-4 py-3">
                <div>
                  <p className="font-semibold text-white text-sm">{PUNCH_LABELS[entry.type]}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatTime(entry.timestamp)}</p>
                </div>
                <span className="text-xs text-gray-500">#{i + 1}</span>
              </div>

              {/* Foto */}
              {entry.photoUrl ? (
                <div
                  className="cursor-zoom-in"
                  onClick={() => setZoomedPhoto(`${API_URL}${entry.photoUrl}`)}
                >
                  <img
                    src={`${API_URL}${entry.photoUrl}`}
                    alt="Selfie do ponto"
                    className="w-full object-cover"
                    style={{ maxHeight: '220px' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <p className="text-xs text-gray-500 text-center pb-1">Toque para ampliar</p>
                </div>
              ) : (
                <div className="bg-gray-750 h-16 flex items-center justify-center text-gray-600 text-sm mx-4 mb-2 rounded-lg border border-gray-700">
                  📷 Sem foto
                </div>
              )}

              {/* Localização */}
              <div className="px-4 pb-3">
                {entry.address && (
                  <p className="text-xs text-gray-400 mb-1">📍 {entry.address}</p>
                )}
                <a
                  href={mapsUrl(entry.latitude, entry.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  🗺️ Ver no Google Maps
                  <span className="text-gray-500">
                    ({entry.latitude.toFixed(4)}, {entry.longitude.toFixed(4)})
                  </span>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Zoom de foto */}
      {zoomedPhoto && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/90" style={{zIndex:10000}}
          onClick={() => setZoomedPhoto(null)}
        >
          <img src={zoomedPhoto} alt="Selfie ampliada" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  )
}
