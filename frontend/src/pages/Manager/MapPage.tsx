import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useLocationStore } from '../../stores/location.store'
import { useSocket } from '../../hooks/useSocket'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import EmployeeDayModal from './EmployeeDayModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002'

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

const PUNCH_LABELS: Record<string, string> = {
  ENTRADA: '🟢 Entrada',
  SAIDA_ALMOCO: '🟡 Saída Almoço',
  RETORNO_ALMOCO: '🔵 Retorno Almoço',
  SAIDA: '🔴 Saída',
}

type Tab = 'mapa' | 'funcionarios' | 'pontos' | 'historico' | 'rastreamento'

function FitTrail({ trail }: { trail: [number, number][] }) {
  const map = useMap()
  const prev = useRef<string>('')
  useEffect(() => {
    if (!trail.length) return
    const key = `${trail[0]}-${trail[trail.length - 1]}`
    if (key === prev.current) return
    prev.current = key
    map.fitBounds(L.latLngBounds(trail), { padding: [40, 40] })
  }, [trail, map])
  return null
}

const API_BASE = import.meta.env.VITE_API_URL || 'https://ampere-point-production.up.railway.app'

export default function MapPage() {
  const { user, logout } = useAuthStore()
  const { userLocations } = useLocationStore()
  const [tab, setTab] = useState<Tab>('mapa')

  // dados
  const [employees, setEmployees] = useState<any[]>([])
  const [workDays, setWorkDays] = useState<any[]>([])
  const [allPunches, setAllPunches] = useState<any[]>([])

  // mapa
  const [selectedTrail, setSelectedTrail] = useState<[number, number][] | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)

  // cadastro
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'EMPLOYEE', unit:'Natal', phone:'', cpf:'', pis:'' })
  const [formLoading, setFormLoading] = useState(false)
  const [formMsg, setFormMsg] = useState<{type:'ok'|'err', text:string}|null>(null)

  // foto ampliada
  const [zoomedPhoto, setZoomedPhoto] = useState<string|null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7))
  const [monthlyExportLoading, setMonthlyExportLoading] = useState(false)

  // mapa — sidebar colapsável
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // pontos — filtro por data
  const [punchDate, setPunchDate] = useState(new Date().toISOString().slice(0, 10))
  const [punchesLoading, setPunchesLoading] = useState(false)

  // histórico — trilha + pontos de um funcionário em uma data
  const [histEmployee, setHistEmployee] = useState<string>('')
  const [histDate, setHistDate] = useState(new Date().toISOString().slice(0, 10))
  const [histPunches, setHistPunches] = useState<any[]>([])
  const [histTrail, setHistTrail] = useState<[number, number][] | null>(null)
  const [histLoading, setHistLoading] = useState(false)
  const [histZoomedPhoto, setHistZoomedPhoto] = useState<string | null>(null)

  // modal de detalhes do funcionário
  const [selectedEmployeeModal, setSelectedEmployeeModal] = useState<{id:string;name:string;unit?:string}|null>(null)

  useSocket(user?.role)

  const loadData = async () => {
    const [u, w, p] = await Promise.all([
      api.get('/api/users'),
      api.get('/api/work-days/today'),
      api.get('/api/time-entries/all/today'),
    ])
    setEmployees(u.data.filter((x: any) => x.role === 'EMPLOYEE'))
    setWorkDays(w.data)
    setAllPunches(p.data)

    // inicializa pins com a coordenada do ponto mais recente de cada funcionário
    const seen = new Set<string>()
    for (const entry of p.data) {
      const uid = entry.user?.id ?? entry.userId
      if (!uid || seen.has(uid)) continue
      seen.add(uid)
      useLocationStore.getState().updateLocation(uid, {
        latitude: entry.latitude,
        longitude: entry.longitude,
        accuracy: entry.accuracy,
        timestamp: entry.timestamp,
      })
    }
  }

  const loadHistorico = async () => {
    if (!histEmployee || !histDate) return
    setHistLoading(true)
    setHistTrail(null)
    setHistPunches([])
    try {
      const [pRes, tRes] = await Promise.all([
        api.get(`/api/time-entries/user/${histEmployee}?date=${histDate}`),
        api.get(`/api/gps-logs/trail/${histEmployee}?date=${histDate}`),
      ])
      setHistPunches(pRes.data.map((e: any) => ({ ...e, photoData: undefined, odometerPhotoData: undefined })))
      const raw: [number, number][] = tRes.data.map((p: any) => [p.latitude, p.longitude])
      const snapped = raw.length >= 2 ? await snapToRoads(raw) : raw
      setHistTrail(snapped.length ? snapped : null)
    } finally {
      setHistLoading(false)
    }
  }

  const loadPunchesByDate = async (date: string) => {
    setPunchesLoading(true)
    try {
      const { data } = await api.get(`/api/time-entries/all?date=${date}`)
      setAllPunches(data)
    } finally {
      setPunchesLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (tab === 'pontos') loadPunchesByDate(punchDate)
  }, [tab, punchDate])

  const getWorkDay = (uid: string) => workDays.find((w: any) => w.userId === uid)
  const getLoc    = (uid: string) => userLocations[uid]
  const fmt       = (ts: string)  => new Date(ts).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })

  const snapToRoads = async (points: [number, number][]): Promise<[number, number][]> => {
    // Limita a 100 pontos por request (limite OSRM)
    // Se tiver mais, amostra os pontos distribuídos
    const MAX = 100
    const sampled = points.length > MAX
      ? Array.from({ length: MAX }, (_, i) => points[Math.round(i * (points.length - 1) / (MAX - 1))])
      : points

    // OSRM espera longitude,latitude (inverso do Leaflet)
    const coords = sampled.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const radiuses = sampled.map(() => '25').join(';') // tolerância de 25m por ponto

    try {
      const res = await fetch(
        `https://router.project-osrm.org/match/v1/driving/${coords}?overview=full&geometries=geojson&radiuses=${radiuses}`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) throw new Error('OSRM error')
      const json = await res.json()
      if (json.code !== 'Ok' || !json.matchings?.length) return points
      // OSRM retorna [lng, lat] — converte para [lat, lng] do Leaflet
      return json.matchings.flatMap((m: any) =>
        m.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
      )
    } catch {
      // Se OSRM falhar, usa os pontos brutos
      return points
    }
  }

  const loadTrail = async (uid: string) => {
    if (selectedUser === uid) { setSelectedTrail(null); setSelectedUser(null); return }
    const { data } = await api.get(`/api/gps-logs/trail/${uid}`)
    const raw: [number, number][] = data.map((p: any) => [p.latitude, p.longitude])
    const snapped = raw.length >= 2 ? await snapToRoads(raw) : raw
    setSelectedTrail(snapped)
    setSelectedUser(uid)
  }

  const exportCSV = async () => {
    setExportLoading(true)
    try {
      const date = new Date().toISOString().slice(0, 10)
      const res = await api.get(`/api/work-days/export?date=${date}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = `ponto-${date}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch { /* silently fail */ } finally {
      setExportLoading(false)
    }
  }

  const exportMonthlyCSV = async () => {
    setMonthlyExportLoading(true)
    try {
      const res = await api.get(`/api/work-days/export-monthly?month=${exportMonth}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = `ponto-${exportMonth}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch { /* silently fail */ } finally {
      setMonthlyExportLoading(false)
    }
  }

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormMsg(null)
    setFormLoading(true)
    try {
      await api.post('/api/users', {
        name: form.name, email: form.email, password: form.password,
        role: form.role, unit: form.unit || undefined,
        phone: form.phone || undefined, cpf: form.cpf || undefined, pis: form.pis || undefined,
      })
      setFormMsg({ type:'ok', text:`✅ ${form.name} cadastrado com sucesso!` })
      setForm({ name:'', email:'', password:'', role:'EMPLOYEE', unit:'Natal', phone:'', cpf:'', pis:'' })
      loadData()
    } catch (err: any) {
      setFormMsg({ type:'err', text:`❌ ${err.response?.data?.message || 'Erro ao cadastrar'}` })
    } finally {
      setFormLoading(false)
    }
  }

  const inField = employees.filter(e => getWorkDay(e.id)?.status === 'EM_SERVICO').length

  const input = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
  const label = "text-xs text-gray-400 mb-1 block"

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="h-screen bg-gray-950 flex flex-col">

      {selectedEmployeeModal && (
        <EmployeeDayModal
          employee={selectedEmployeeModal}
          date={today}
          workDay={getWorkDay(selectedEmployeeModal.id)}
          onClose={() => setSelectedEmployeeModal(null)}
        />
      )}

      {/* ── HEADER ── */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex justify-between items-center shrink-0">
        <span className="text-lg font-bold text-white">⚡ AmperePoint</span>
        <div className="flex gap-3 text-sm items-center">
          <span className="text-green-400">● {inField} em campo</span>
          <button onClick={logout} className="text-gray-400 hover:text-white">Sair</button>
        </div>
      </div>

      {/* ── ABAS ── */}
      <div className="bg-gray-900 border-b border-gray-800 flex shrink-0">
        {([['mapa','🗺️ Mapa'],['funcionarios','👤 Funcionários'],['pontos','📋 Pontos & Fotos'],['historico','🕐 Histórico'],['rastreamento','📡 Rastreamento']] as [Tab,string][]).map(([t,label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 ${
              tab === t
                ? 'border-green-500 text-green-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CONTEÚDO ── */}
      <div className="flex-1 overflow-hidden">

        {/* MAPA */}
        {tab === 'mapa' && (
          <div className="flex h-full">
            {/* sidebar */}
            <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-gray-900 overflow-hidden shrink-0 transition-all duration-200`}>
              <div className="p-3 w-64 h-full overflow-y-auto">
                <button
                  onClick={exportCSV}
                  disabled={exportLoading}
                  className="w-full mb-3 py-2 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                >
                  {exportLoading ? 'Exportando...' : '⬇️ Exportar CSV'}
                </button>
                <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3">Funcionários</p>
                {employees.map(emp => {
                  const wd = getWorkDay(emp.id)
                  const loc = getLoc(emp.id)
                  const isActive = wd?.status === 'EM_SERVICO'
                  return (
                    <div
                      key={emp.id}
                      className={`rounded-xl mb-2 border transition-colors ${
                        selectedUser === emp.id ? 'bg-green-900/30 border-green-700' : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div
                        className="cursor-pointer p-3 pb-1"
                        onClick={() => setSelectedEmployeeModal({ id: emp.id, name: emp.name, unit: emp.unit })}
                      >
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-white text-sm hover:text-green-400 transition-colors">{emp.name}</span>
                          <span className={`text-xs font-bold ${isActive ? 'text-green-400' : 'text-gray-500'}`}>
                            {isActive ? '● Campo' : '○ Fora'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{emp.unit}</p>
                        {wd && (
                          <div className="flex gap-3 mt-1 text-xs">
                            <span className="text-blue-400">📍 {wd.totalKm.toFixed(1)} km</span>
                            <span className="text-gray-400">⏱ {Math.floor(wd.totalMinutes/60)}h{wd.totalMinutes%60}m</span>
                          </div>
                        )}
                        {loc && <p className="text-xs text-gray-600 mt-1">Última pos: {fmt(loc.timestamp)}</p>}
                      </div>
                      <button
                        onClick={() => loadTrail(emp.id)}
                        className="w-full text-xs text-gray-500 hover:text-green-400 py-1.5 px-3 border-t border-gray-700 transition-colors"
                      >
                        {selectedUser === emp.id ? '🗺️ Ocultar traçado' : '🗺️ Ver traçado'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* faixa toggle — fica entre sidebar e mapa, sem sobrepor nada */}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              title={sidebarOpen ? 'Ocultar lista' : 'Mostrar lista'}
              className="w-5 shrink-0 bg-gray-800 hover:bg-gray-700 border-x border-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors text-xs"
            >
              {sidebarOpen ? '‹' : '›'}
            </button>

            {/* mapa */}
            <div className="flex-1">
              <MapContainer center={[-5.7945,-35.2110]} zoom={12} style={{height:'100%',width:'100%'}}>

                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
                {employees.map(emp => {
                  const loc = getLoc(emp.id)
                  const wd  = getWorkDay(emp.id)
                  if (!loc) return null
                  return (
                    <Marker key={emp.id} position={[loc.latitude,loc.longitude]} icon={wd?.status==='EM_SERVICO'?greenIcon:grayIcon}>
                      <Popup>
                        <p className="font-bold">{emp.name}</p>
                        <p>{emp.unit}</p>
                        {wd && <p>📍 {wd.totalKm.toFixed(1)} km hoje</p>}
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
        )}

        {/* FUNCIONÁRIOS */}
        {tab === 'funcionarios' && (
          <div className="flex h-full overflow-hidden">
            {/* lista */}
            <div className="w-72 border-r border-gray-800 overflow-y-auto p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3">Cadastrados ({employees.length})</p>
              {employees.map(emp => (
                <div
                  key={emp.id}
                  className="bg-gray-800 border border-gray-700 rounded-xl p-3 mb-2 cursor-pointer hover:border-green-700 transition-colors"
                  onClick={() => setSelectedEmployeeModal({ id: emp.id, name: emp.name, unit: emp.unit })}
                >
                  <p className="font-semibold text-white text-sm hover:text-green-400 transition-colors">{emp.name}</p>
                  <p className="text-xs text-gray-400">{emp.email}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{emp.unit}</span>
                    <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">Vendedor</span>
                  </div>
                </div>
              ))}
            </div>

            {/* área direita */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* relatório mensal */}
              <div className="max-w-lg mb-8 bg-gray-900 border border-gray-700 rounded-2xl p-5">
                <h2 className="text-base font-bold text-white mb-1">📊 Relatório Mensal</h2>
                <p className="text-gray-400 text-sm mb-4">Exporta ponto completo do mês — todos os funcionários, por dia.</p>
                <div className="flex gap-3">
                  <input
                    type="month"
                    value={exportMonth}
                    onChange={e => setExportMonth(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  />
                  <button
                    onClick={exportMonthlyCSV}
                    disabled={monthlyExportLoading}
                    className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors whitespace-nowrap"
                  >
                    {monthlyExportLoading ? 'Exportando...' : '⬇️ Exportar CSV'}
                  </button>
                </div>
              </div>

              <h2 className="text-lg font-bold text-white mb-1">Novo Funcionário</h2>
              <p className="text-gray-400 text-sm mb-5">Preencha os dados para cadastrar um novo acesso.</p>

              <form onSubmit={submitForm} className="max-w-lg flex flex-col gap-4">
                {formMsg && (
                  <div className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                    formMsg.type==='ok' ? 'bg-green-900/40 text-green-400 border border-green-700' : 'bg-red-900/40 text-red-400 border border-red-700'
                  }`}>
                    {formMsg.text}
                  </div>
                )}

                <div>
                  <label className={label}>Nome completo *</label>
                  <input required value={form.name} onChange={e=>setF('name',e.target.value)} placeholder="Ex: João Silva" className={input} />
                </div>

                <div>
                  <label className={label}>E-mail *</label>
                  <input required type="email" value={form.email} onChange={e=>setF('email',e.target.value)} placeholder="joao@ampere.com" className={input} />
                </div>

                <div>
                  <label className={label}>Senha inicial *</label>
                  <input required type="password" minLength={6} value={form.password} onChange={e=>setF('password',e.target.value)} placeholder="Mínimo 6 caracteres" className={input} />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className={label}>Função</label>
                    <select value={form.role} onChange={e=>setF('role',e.target.value)} className={input}>
                      <option value="EMPLOYEE">Vendedor</option>
                      <option value="MANAGER">Gestor</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className={label}>Unidade</label>
                    <select value={form.unit} onChange={e=>setF('unit',e.target.value)} className={input}>
                      <option value="Natal">Natal</option>
                      <option value="Caruaru">Caruaru</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={label}>Telefone</label>
                  <input value={form.phone} onChange={e=>setF('phone',e.target.value)} placeholder="(84) 99999-9999" className={input} />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className={label}>CPF</label>
                    <input value={form.cpf} onChange={e=>setF('cpf',e.target.value)} placeholder="000.000.000-00" className={input} />
                  </div>
                  <div className="flex-1">
                    <label className={label}>PIS</label>
                    <input value={form.pis} onChange={e=>setF('pis',e.target.value)} placeholder="000.00000.00-0" className={input} />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors text-sm"
                >
                  {formLoading ? 'Cadastrando...' : '+ Cadastrar Funcionário'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* PONTOS & FOTOS */}
        {tab === 'pontos' && (
          <div className="h-full overflow-y-auto p-4">
            {/* foto ampliada */}
            {zoomedPhoto && (
              <div
                onClick={() => setZoomedPhoto(null)}
                className="fixed inset-0 bg-black/90 flex items-center justify-center cursor-zoom-out"
                style={{zIndex:9999}}
              >
                <img src={zoomedPhoto} alt="Foto ampliada" className="max-w-full max-h-full rounded-xl shadow-2xl" />
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white">Registros de Ponto</h2>
                {punchesLoading && <span className="text-xs text-gray-500 animate-pulse">Carregando...</span>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={punchDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setPunchDate(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-green-500"
                />
                <button
                  onClick={() => loadPunchesByDate(punchDate)}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700"
                >
                  🔄
                </button>
              </div>
            </div>

            {!punchesLoading && allPunches.length === 0 && (
              <p className="text-gray-500 text-center py-16">Nenhum ponto registrado nesta data.</p>
            )}

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {allPunches.map((punch: any) => (
                <div key={punch.id} className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
                  {/* foto */}
                  {punch.photoUrl ? (
                    <div
                      className="cursor-zoom-in relative"
                      onClick={() => setZoomedPhoto(`${API_URL}${punch.photoUrl}`)}
                    >
                      <img
                        src={`${API_URL}${punch.photoUrl}`}
                        alt="Selfie"
                        className="w-full object-cover"
                        style={{height:'180px'}}
                        onError={e => { (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="h-44 flex items-center justify-center text-gray-600 text-sm">📷 Foto indisponível</div>' }}
                      />
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                        🔍 Ampliar
                      </div>
                    </div>
                  ) : (
                    <div className="h-28 flex items-center justify-center bg-gray-800 text-gray-600 text-sm">
                      📷 Sem foto
                    </div>
                  )}

                  {/* info */}
                  <div className="p-3">
                    <p className="font-semibold text-white text-sm">{punch.user?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400 mb-2">{punch.user?.unit}</p>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-gray-300">{PUNCH_LABELS[punch.type]}</span>
                      <span className="text-xs text-gray-500">{fmt(punch.timestamp)}</span>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${punch.latitude},${punch.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-gray-800 px-2 py-1.5 rounded-lg"
                    >
                      🗺️ Ver localização
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HISTÓRICO */}
        {tab === 'historico' && (
          <div className="flex h-full overflow-hidden">

            {/* painel esquerdo — filtros + pontos */}
            <div className="w-80 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">

              {/* filtros */}
              <div className="p-4 border-b border-gray-800 shrink-0">
                <h2 className="text-sm font-bold text-white mb-3">🕐 Histórico de Funcionário</h2>
                <div className="flex flex-col gap-2">
                  <select
                    value={histEmployee}
                    onChange={e => setHistEmployee(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  >
                    <option value="">Selecione o funcionário…</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} — {emp.unit}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={histDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={e => setHistDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  />
                  <button
                    onClick={loadHistorico}
                    disabled={!histEmployee || histLoading}
                    className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-bold rounded-lg text-sm transition-colors"
                  >
                    {histLoading ? 'Carregando…' : '🔍 Buscar'}
                  </button>
                </div>
              </div>

              {/* pontos do dia */}
              <div className="flex-1 overflow-y-auto p-3">
                {histZoomedPhoto && (
                  <div
                    onClick={() => setHistZoomedPhoto(null)}
                    className="fixed inset-0 bg-black/90 flex items-center justify-center cursor-zoom-out"
                    style={{ zIndex: 9999 }}
                  >
                    <img src={histZoomedPhoto} alt="Foto ampliada" className="max-w-full max-h-full rounded-xl shadow-2xl" />
                  </div>
                )}

                {!histLoading && histPunches.length === 0 && histEmployee && (
                  <p className="text-gray-500 text-sm text-center py-8">Nenhum ponto nesta data.</p>
                )}
                {!histLoading && !histEmployee && (
                  <p className="text-gray-600 text-sm text-center py-8">Selecione um funcionário e uma data.</p>
                )}

                {histPunches.map((punch: any) => (
                  <div key={punch.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden mb-3">
                    {punch.photoUrl && (
                      <div
                        className="cursor-zoom-in relative"
                        onClick={() => setHistZoomedPhoto(`${API_URL}${punch.photoUrl}`)}
                      >
                        <img
                          src={`${API_URL}${punch.photoUrl}`}
                          alt="Selfie"
                          className="w-full object-cover"
                          style={{ height: '140px' }}
                          onError={e => { (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="h-28 flex items-center justify-center text-gray-600 text-xs">📷 Foto indisponível</div>' }}
                        />
                        <div className="absolute bottom-1 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">🔍</div>
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-gray-200">{PUNCH_LABELS[punch.type]}</span>
                        <span className="text-xs text-gray-500">{fmt(punch.timestamp)}</span>
                      </div>
                      {punch.odometerKm != null && (
                        <p className="text-xs text-blue-400 mb-1">🚗 Tacômetro: {punch.odometerKm} km</p>
                      )}
                      <a
                        href={`https://www.google.com/maps?q=${punch.latitude},${punch.longitude}`}
                        target="_blank" rel="noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        📍 Ver no Maps
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* mapa com trilha */}
            <div className="flex-1">
              <MapContainer center={[-5.7945, -35.2110]} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
                {histTrail && histTrail.length > 1 && (
                  <>
                    <FitTrail trail={histTrail} />
                    <Polyline positions={histTrail} color="#f97316" weight={4} opacity={0.85} />
                    <Marker position={histTrail[0]} icon={greenIcon}>
                      <Popup>Início</Popup>
                    </Marker>
                    <Marker position={histTrail[histTrail.length - 1]} icon={grayIcon}>
                      <Popup>Fim</Popup>
                    </Marker>
                  </>
                )}
                {histPunches.map((punch: any) => (
                  <Marker key={punch.id} position={[punch.latitude, punch.longitude]}>
                    <Popup>
                      <p className="font-bold text-sm">{PUNCH_LABELS[punch.type]}</p>
                      <p className="text-xs text-gray-600">{fmt(punch.timestamp)}</p>
                      {punch.odometerKm != null && <p className="text-xs">🚗 {punch.odometerKm} km</p>}
                    </Popup>
                  </Marker>
                ))}
                {!histTrail && histEmployee && !histLoading && (
                  <></>
                )}
              </MapContainer>
              {!histTrail && !histLoading && histEmployee && (
                <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none">
                  <p className="bg-gray-900/80 text-gray-400 text-sm px-4 py-2 rounded-xl">Sem dados de GPS para esta data</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RASTREAMENTO — OwnTracks */}
        {tab === 'rastreamento' && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-lg font-bold text-white mb-1">📡 Rastreamento em Segundo Plano</h2>
              <p className="text-gray-400 text-sm mb-6">
                Configure o <strong className="text-white">OwnTracks</strong> no celular de cada funcionário para rastrear a localização com a tela desligada.
              </p>

              {/* Passo a passo */}
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-6">
                <h3 className="font-bold text-white mb-4">Como configurar (uma vez por celular)</h3>
                <ol className="space-y-4 text-sm text-gray-300">
                  <li className="flex gap-3">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span>Baixe o <strong className="text-white">OwnTracks</strong> na App Store (iOS) ou Play Store (Android) — é gratuito</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <span>Abra o app → toque no ícone <strong className="text-white">(i)</strong> no canto superior esquerdo → <strong className="text-white">Configurações</strong></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <span>Em <strong className="text-white">Mode</strong>, selecione <strong className="text-white">HTTP</strong></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <span>Em <strong className="text-white">URL</strong>, cole o link do funcionário (veja abaixo)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">5</span>
                    <span>No iOS: vá em Ajustes → OwnTracks → Localização → <strong className="text-white">Sempre</strong></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">6</span>
                    <span>No app, selecione o modo <strong className="text-white">Move</strong> (atualiza com frequência) e deixe rodando</span>
                  </li>
                </ol>
              </div>

              {/* Links por funcionário */}
              <h3 className="font-bold text-white mb-3">Links por funcionário</h3>
              <div className="space-y-3">
                {employees.map(emp => {
                  const url = `${API_BASE}/api/gps-ext/${emp.id}`
                  return (
                    <div key={emp.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold text-white text-sm">{emp.name}</p>
                          <p className="text-xs text-gray-500">{emp.unit}</p>
                        </div>
                        <button
                          onClick={() => { navigator.clipboard.writeText(url) }}
                          className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                        >
                          📋 Copiar URL
                        </button>
                      </div>
                      <code className="block text-xs text-green-400 bg-gray-800 rounded-lg px-3 py-2 break-all">
                        {url}
                      </code>
                    </div>
                  )
                })}
              </div>

              <div className="mt-6 bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4 text-sm text-yellow-300">
                <p className="font-semibold mb-1">⚡ Dica de bateria</p>
                <p className="text-yellow-400 text-xs">No OwnTracks, use o modo <strong>Significant</strong> para economizar bateria (atualiza apenas quando há deslocamento significativo) ou <strong>Move</strong> para rastreamento mais frequente.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
