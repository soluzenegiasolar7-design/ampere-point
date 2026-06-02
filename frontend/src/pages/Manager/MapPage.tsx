import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useLocationStore } from '../../stores/location.store'
import { useSocket } from '../../hooks/useSocket'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import NewEmployeeModal from './NewEmployeeModal'
import EmployeePunchesModal from './EmployeePunchesModal'

// Fix leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
})

const grayIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
})

export default function MapPage() {
  const { user, logout } = useAuthStore()
  const { userLocations } = useLocationStore()
  const [employees, setEmployees] = useState<any[]>([])
  const [workDays, setWorkDays] = useState<any[]>([])
  const [selectedTrail, setSelectedTrail] = useState<[number, number][] | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [showNewEmployee, setShowNewEmployee] = useState(false)
  const [selectedPunchEmployee, setSelectedPunchEmployee] = useState<any | null>(null)

  useSocket(user?.role)

  const loadData = () => {
    Promise.all([
      api.get('/api/users'),
      api.get('/api/work-days/today'),
    ]).then(([usersRes, wdRes]) => {
      setEmployees(usersRes.data.filter((u: any) => u.role === 'EMPLOYEE'))
      setWorkDays(wdRes.data)
    })
  }

  useEffect(() => { loadData() }, [])

  const loadTrail = async (userId: string) => {
    if (selectedUser === userId) { setSelectedTrail(null); setSelectedUser(null); return }
    const { data } = await api.get(`/api/gps-logs/trail/${userId}`)
    setSelectedTrail(data.map((p: any) => [p.latitude, p.longitude]))
    setSelectedUser(userId)
  }

  const getWorkDay = (userId: string) => workDays.find((w: any) => w.userId === userId)
  const getLoc = (userId: string) => userLocations[userId]

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="h-screen bg-gray-950 flex flex-col">
      {showNewEmployee && (
        <NewEmployeeModal
          onClose={() => setShowNewEmployee(false)}
          onCreated={loadData}
        />
      )}
      {selectedPunchEmployee && (
        <EmployeePunchesModal
          employee={selectedPunchEmployee}
          onClose={() => setSelectedPunchEmployee(null)}
        />
      )}
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex justify-between items-center shrink-0">
        <div>
          <span className="text-lg font-bold text-white">⚡ AmperePoint</span>
          <span className="text-gray-400 text-sm ml-2">Gestão</span>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="text-green-400">● {employees.filter(e => getWorkDay(e.id)?.status === 'EM_SERVICO').length} em campo</span>
          <button onClick={logout} className="text-gray-400 hover:text-white">Sair</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 bg-gray-900 border-r border-gray-800 overflow-y-auto shrink-0">
          <div className="p-3">
            <div className="flex justify-between items-center mb-3">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Funcionários Hoje</p>
              <button
                onClick={() => setShowNewEmployee(true)}
                className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded-lg font-semibold transition-colors"
              >
                + Novo
              </button>
            </div>
            {employees.map((emp) => {
              const wd = getWorkDay(emp.id)
              const loc = getLoc(emp.id)
              const isActive = wd?.status === 'EM_SERVICO'
              return (
                <div
                  key={emp.id}
                  className={`w-full text-left p-3 rounded-xl mb-2 border transition-colors ${
                    selectedUser === emp.id
                      ? 'bg-green-900/30 border-green-700'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => loadTrail(emp.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-white text-sm">{emp.name}</span>
                      <span className={`text-xs font-bold ${isActive ? 'text-green-400' : 'text-gray-500'}`}>
                        {isActive ? '● Em campo' : '○ Fora'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{emp.unit}</p>
                    {wd && (
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className="text-blue-400">📍 {wd.totalKm.toFixed(1)} km</span>
                        <span className="text-gray-400">⏱ {Math.floor(wd.totalMinutes / 60)}h{wd.totalMinutes % 60}m</span>
                      </div>
                    )}
                    {loc && (
                      <p className="text-xs text-gray-500 mt-1">
                        Última pos: {formatTime(loc.timestamp)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedPunchEmployee(emp)}
                    className="mt-2 w-full text-center text-xs text-blue-400 hover:text-blue-300 bg-gray-700/50 hover:bg-gray-700 py-1 rounded-lg transition-colors"
                  >
                    📋 Ver pontos e fotos
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Mapa */}
        <div className="flex-1">
          <MapContainer
            center={[-5.7945, -35.2110]}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© OpenStreetMap'
            />
            {employees.map((emp) => {
              const loc = getLoc(emp.id)
              const wd = getWorkDay(emp.id)
              if (!loc) return null
              const isActive = wd?.status === 'EM_SERVICO'
              return (
                <Marker
                  key={emp.id}
                  position={[loc.latitude, loc.longitude]}
                  icon={isActive ? greenIcon : grayIcon}
                >
                  <Popup>
                    <div className="text-sm">
                      <p className="font-bold">{emp.name}</p>
                      <p className="text-gray-600">{emp.unit}</p>
                      <p>{isActive ? '🟢 Em serviço' : '⚫ Fora'}</p>
                      {wd && <p>📍 {wd.totalKm.toFixed(1)} km hoje</p>}
                      <p className="text-gray-400 text-xs">Atualizado: {formatTime(loc.timestamp)}</p>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
            {selectedTrail && selectedTrail.length > 1 && (
              <Polyline positions={selectedTrail} color="#4ade80" weight={3} opacity={0.8} />
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  )
}
