import { useEffect, useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Zap, LogOut, Map, Users, Clock, History, Radio,
  ChevronLeft, ChevronRight, Search, Download, UserPlus,
  Edit2, UserX, UserCheck, RefreshCw, MapPin, Navigation,
  Camera, Car, FileText, Copy, CheckCircle2, AlertCircle, X, Briefcase
} from 'lucide-react'
import { useLocationStore } from '../../stores/location.store'
import { useSocket } from '../../hooks/useSocket'
import { api, photoUrl } from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import EmployeeDayModal from './EmployeeDayModal'
import HRPanel from './HRPanel'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { clsx } from 'clsx'

const API_BASE = import.meta.env.VITE_API_URL || 'https://ampere-point-production.up.railway.app'

// ── Leaflet icons ──
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
  ENTRADA: 'Entrada', SAIDA_ALMOCO: 'Saída Almoço',
  RETORNO_ALMOCO: 'Retorno Almoço', SAIDA: 'Saída',
}
const PUNCH_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
  ENTRADA: 'success', SAIDA_ALMOCO: 'warning', RETORNO_ALMOCO: 'info', SAIDA: 'danger',
}

type Tab = 'mapa' | 'funcionarios' | 'pontos' | 'historico' | 'rastreamento' | 'rh'
type UnitFilter = 'all' | 'Natal' | 'Caruaru'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'mapa',         label: 'Mapa',         icon: <Map size={16} /> },
  { id: 'funcionarios', label: 'Funcionários',  icon: <Users size={16} /> },
  { id: 'pontos',       label: 'Pontos',        icon: <Clock size={16} /> },
  { id: 'historico',    label: 'Histórico',     icon: <History size={16} /> },
  { id: 'rastreamento', label: 'Rastreamento',  icon: <Radio size={16} /> },
  { id: 'rh',           label: 'RH',            icon: <Briefcase size={16} /> },
]

function FitTrail({ trail }: { trail: [number, number][] }) {
  const map = useMap()
  const prev = useRef('')
  useEffect(() => {
    if (!trail.length) return
    const key = `${trail[0]}-${trail[trail.length - 1]}`
    if (key === prev.current) return
    prev.current = key
    map.fitBounds(L.latLngBounds(trail), { padding: [40, 40] })
  }, [trail, map])
  return null
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(ts: string) {
  return new Date(ts).toLocaleDateString('pt-BR')
}
function fmtMin(m: number) {
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

async function snapToRoads(points: [number, number][]): Promise<[number, number][]> {
  const MAX = 100
  const sampled = points.length > MAX
    ? Array.from({ length: MAX }, (_, i) => points[Math.round(i * (points.length - 1) / (MAX - 1))])
    : points
  const coords = sampled.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const radiuses = sampled.map(() => '25').join(';')
  try {
    const res = await fetch(
      `https://router.project-osrm.org/match/v1/driving/${coords}?overview=full&geometries=geojson&radiuses=${radiuses}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return points
    const json = await res.json()
    if (json.code !== 'Ok' || !json.matchings?.length) return points
    return json.matchings.flatMap((m: any) =>
      m.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
    )
  } catch { return points }
}

export default function MapPage() {
  const { user, logout } = useAuthStore()
  const { userLocations } = useLocationStore()
  const [tab, setTab] = useState<Tab>('mapa')

  const [employees, setEmployees] = useState<any[]>([])
  const [inactiveEmployees, setInactiveEmployees] = useState<any[]>([])
  const [workDays, setWorkDays] = useState<any[]>([])
  const [allPunches, setAllPunches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [unitFilter, setUnitFilter] = useState<UnitFilter>('all')
  const [now, setNow] = useState(new Date())

  // mapa
  const [selectedTrail, setSelectedTrail] = useState<[number, number][] | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedEmployeeModal, setSelectedEmployeeModal] = useState<{ id: string; name: string; unit?: string } | null>(null)

  // funcionários
  const [editEmp, setEditEmp] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [empForm, setEmpForm] = useState({ name: '', email: '', password: '', role: 'EMPLOYEE', unit: 'Natal', phone: '', cpf: '', pis: '' })
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'EMPLOYEE', unit: 'Natal', phone: '', cpf: '', pis: '', password: '' })
  const [formLoading, setFormLoading] = useState(false)
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  // pontos
  const [punchDate, setPunchDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [punchesLoading, setPunchesLoading] = useState(false)
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null)
  const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7))
  const [exportLoading, setExportLoading] = useState(false)

  // histórico
  const [histEmployee, setHistEmployee] = useState('')
  const [histDateFrom, setHistDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toLocaleDateString('en-CA') })
  const [histDateTo, setHistDateTo] = useState(new Date().toLocaleDateString('en-CA'))
  const [histPunches, setHistPunches] = useState<any[]>([])
  const [histTrail, setHistTrail] = useState<[number, number][] | null>(null)
  const [histSummary, setHistSummary] = useState<any>(null)
  const [histLoading, setHistLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  useSocket(user?.role)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const entradaByUser = useCallback((): Record<string, Date> => {
    const map: Record<string, Date> = {}
    for (const p of allPunches) {
      if (p.type === 'ENTRADA') map[p.user?.id ?? p.userId] = new Date(p.timestamp)
    }
    return map
  }, [allPunches])

  const punchTypeByUser = useCallback((): Record<string, string> => {
    const last: Record<string, string> = {}
    for (const p of allPunches) {
      const uid = p.user?.id ?? p.userId
      if (!last[uid]) last[uid] = p.type
    }
    return last
  }, [allPunches])

  const elapsedSince = (ts: Date): string => {
    const mins = Math.floor((now.getTime() - ts.getTime()) / 60000)
    return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [u, all, w, p] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/users?includeInactive=true'),
        api.get('/api/work-days/today'),
        api.get('/api/time-entries/all/today'),
      ])
      setEmployees(u.data.filter((x: any) => x.role === 'EMPLOYEE'))
      setInactiveEmployees(all.data.filter((x: any) => x.role === 'EMPLOYEE' && !x.isActive))
      setWorkDays(w.data)
      setAllPunches(p.data)

      const seen = new Set<string>()
      for (const entry of p.data) {
        const uid = entry.user?.id ?? entry.userId
        if (!uid || seen.has(uid)) continue
        if (entry.latitude == null || entry.longitude == null) continue
        seen.add(uid)
        useLocationStore.getState().updateLocation(uid, { latitude: entry.latitude, longitude: entry.longitude, accuracy: entry.accuracy, timestamp: entry.timestamp })
      }
    } finally { setLoading(false) }
  }

  const loadPunchesByDate = async (date: string) => {
    setPunchesLoading(true)
    try { const { data } = await api.get(`/api/time-entries/all?date=${date}`); setAllPunches(data) }
    finally { setPunchesLoading(false) }
  }

  const loadHistorico = async () => {
    if (!histEmployee) return
    setHistLoading(true); setHistTrail(null); setHistPunches([]); setHistSummary(null)
    try {
      const params = `dateFrom=${histDateFrom}&dateTo=${histDateTo}`
      const [pRes, tRes, sRes] = await Promise.all([
        api.get(`/api/time-entries/user/${histEmployee}?${params}`),
        api.get(`/api/gps-logs/trail/${histEmployee}?${params}`),
        api.get(`/api/work-days/summary/${histEmployee}?${params}`),
      ])
      setHistPunches(pRes.data)
      setHistSummary(sRes.data)
      const raw: [number, number][] = tRes.data.map((p: any) => [p.latitude, p.longitude])
      const snapped = raw.length >= 2 ? await snapToRoads(raw) : raw
      setHistTrail(snapped.length ? snapped : null)
    } finally { setHistLoading(false) }
  }

  const loadTrail = async (uid: string) => {
    if (selectedUser === uid) { setSelectedTrail(null); setSelectedUser(null); return }
    const { data } = await api.get(`/api/gps-logs/trail/${uid}`)
    const raw: [number, number][] = data.map((p: any) => [p.latitude, p.longitude])
    const snapped = raw.length >= 2 ? await snapToRoads(raw) : raw
    setSelectedTrail(snapped); setSelectedUser(uid)
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (tab === 'pontos') loadPunchesByDate(punchDate) }, [tab, punchDate])

  const getWorkDay   = (uid: string) => workDays.find((w: any) => w.userId === uid)
  const getLoc       = (uid: string) => userLocations[uid]
  const entrada      = entradaByUser()
  const lastPunch    = punchTypeByUser()
  const absentEmps   = employees.filter(e => !workDays.some(w => w.userId === e.id))
  const onLunchEmps  = employees.filter(e => lastPunch[e.id] === 'SAIDA_ALMOCO')
  const finishedEmps = employees.filter(e => getWorkDay(e.id)?.status === 'FORA')
  const inField      = employees.filter(e => {
    const wd = getWorkDay(e.id)
    return wd?.status === 'EM_SERVICO' && lastPunch[e.id] !== 'SAIDA_ALMOCO'
  }).length
  const filteredEmployees = unitFilter === 'all' ? employees : employees.filter(e => e.unit === unitFilter)

  const openEditEmp = (emp: any) => {
    setEditEmp(emp)
    setShowForm(false)
    setEditForm({ name: emp.name, email: emp.email, role: emp.role, unit: emp.unit || 'Natal', phone: emp.phone || '', cpf: emp.cpf || '', pis: emp.pis || '', password: '' })
    setFormMsg(null)
  }

  const submitEditEmp = async (e: React.FormEvent) => {
    e.preventDefault(); setFormLoading(true); setFormMsg(null)
    try {
      await api.patch(`/api/users/${editEmp.id}`, {
        name: editForm.name, role: editForm.role, unit: editForm.unit,
        phone: editForm.phone || undefined,
        ...(editForm.cpf !== (editEmp.cpf ?? '') ? { cpf: editForm.cpf || null } : {}),
        ...(editForm.pis !== (editEmp.pis ?? '') ? { pis: editForm.pis || null } : {}),
        ...(editForm.password ? { password: editForm.password } : {}),
      })
      setFormMsg({ type: 'ok', text: 'Dados atualizados com sucesso!' })
      loadData()
    } catch (err: any) {
      setFormMsg({ type: 'err', text: err.response?.data?.error || 'Erro ao atualizar' })
    } finally { setFormLoading(false) }
  }

  const inactivateEmp = async () => {
    if (!editEmp || !confirm(`Inativar ${editEmp.name}?`)) return
    await api.patch(`/api/users/${editEmp.id}`, { isActive: false })
    setEditEmp(null); loadData()
  }

  const reactivateEmp = async (emp: any) => {
    if (!confirm(`Reativar ${emp.name}?`)) return
    await api.patch(`/api/users/${emp.id}`, { isActive: true })
    loadData()
  }

  const submitNewEmp = async (e: React.FormEvent) => {
    e.preventDefault(); setFormLoading(true); setFormMsg(null)
    try {
      await api.post('/api/users', {
        name: empForm.name, email: empForm.email, password: empForm.password,
        role: empForm.role, unit: empForm.unit || undefined,
        phone: empForm.phone || undefined, cpf: empForm.cpf || undefined, pis: empForm.pis || undefined,
      })
      setFormMsg({ type: 'ok', text: `${empForm.name} cadastrado com sucesso!` })
      setEmpForm({ name: '', email: '', password: '', role: 'EMPLOYEE', unit: 'Natal', phone: '', cpf: '', pis: '' })
      loadData()
    } catch (err: any) {
      setFormMsg({ type: 'err', text: err.response?.data?.message || 'Erro ao cadastrar' })
    } finally { setFormLoading(false) }
  }

  const exportMonthlyCSV = async () => {
    setExportLoading(true)
    try {
      const res = await api.get(`/api/work-days/export-monthly?month=${exportMonth}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = `ponto-${exportMonth}.csv`; a.click()
      URL.revokeObjectURL(url)
    } finally { setExportLoading(false) }
  }

  const exportHistoricoPDF = async () => {
    if (!histSummary || !histEmployee) return
    setPdfLoading(true)
    try {
      const emp = employees.find(e => e.id === histEmployee)
      const empName = emp?.name ?? 'Funcionario'
      const empUnit = emp?.unit ?? ''
      const dateFromFmt = new Date(histDateFrom + 'T12:00:00').toLocaleDateString('pt-BR')
      const dateToFmt   = new Date(histDateTo   + 'T12:00:00').toLocaleDateString('pt-BR')
      const standardMin = histSummary.workDays * 480
      const extraMin    = Math.max(0, histSummary.totalMinutes - standardMin)

      const addressMap: Record<string, string> = {}
      for (const p of histPunches) {
        if (p.address) { addressMap[p.id] = p.address; continue }
        if (!p.latitude || !p.longitude) continue
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.latitude}&lon=${p.longitude}&accept-language=pt-BR`,
            { headers: { 'User-Agent': 'AmperePoint/1.0' }, signal: AbortSignal.timeout(5000) }
          )
          if (res.ok) { const json = await res.json() as { display_name?: string }; if (json.display_name) addressMap[p.id] = json.display_name }
        } catch { /* skip */ }
        await new Promise(r => setTimeout(r, 1100))
      }

      const photoMap: Record<string, string> = {}
      await Promise.all(histPunches.map(async (p: any) => {
        if (!p.photoUrl) return
        try {
          const res = await api.get(p.photoUrl, { responseType: 'blob' })
          const b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(res.data)
          })
          photoMap[p.id] = b64
        } catch { /* skip */ }
      }))

      const doc = new jsPDF({ format: 'a4', unit: 'mm' })
      const W = doc.internal.pageSize.width

      const drawHeader = () => {
        doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40)
        doc.text('Ampere Solucoes', W / 2, 12, { align: 'center' })
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
        doc.text('Extrato de Pontos', W / 2, 20, { align: 'center' })
        doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.4); doc.line(14, 30, W - 14, 30)
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40)
        doc.text(empName.toUpperCase(), W / 2, 37, { align: 'center' })
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.rect(14, 40, W - 28, 18)
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40)
        doc.text('Colaborador:', 18, 46); doc.setFont('helvetica', 'normal'); doc.text(empName, 18, 52)
        doc.setFont('helvetica', 'bold'); doc.text('Unidade:', W / 2 - 10, 46); doc.setFont('helvetica', 'normal'); doc.text(empUnit, W / 2 - 10, 52)
        doc.setFont('helvetica', 'bold'); doc.text('Periodo:', W - 76, 46); doc.setFont('helvetica', 'normal'); doc.text(`${dateFromFmt} a ${dateToFmt}`, W - 76, 52)
      }
      drawHeader()

      const LABELS: Record<string, string> = { ENTRADA: 'Entrada', SAIDA_ALMOCO: 'Saida Almoco', RETORNO_ALMOCO: 'Retorno Almoco', SAIDA: 'Saida' }
      const rows = histPunches.map((p: any) => {
        const dt = new Date(p.timestamp)
        return [
          `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
          LABELS[p.type] ?? p.type, addressMap[p.id] ?? '-', p.odometerKm != null ? `${p.odometerKm} km` : '-', '',
        ]
      })

      autoTable(doc, {
        startY: 56, margin: { top: 56, left: 14, right: 14 },
        head: [['Data do Ponto', 'Tipo', 'Localizacao', 'KM Tac.', 'Foto']],
        body: rows,
        headStyles: { fillColor: [245, 245, 245], textColor: [40, 40, 40], fontStyle: 'bold', lineWidth: 0.3, lineColor: [200, 200, 200], fontSize: 8.5 },
        bodyStyles: { minCellHeight: 28, valign: 'middle', lineWidth: 0.2, lineColor: [220, 220, 220], fontSize: 8, textColor: [50, 50, 50] },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 26 }, 2: { cellWidth: 70 }, 3: { cellWidth: 18 }, 4: { cellWidth: 27 } },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            const p = histPunches[data.row.index]
            const img = photoMap[p?.id]
            if (img) {
              const s = Math.min(data.cell.height - 4, 23)
              doc.addImage(img, 'JPEG', data.cell.x + (data.cell.width - s) / 2, data.cell.y + (data.cell.height - s) / 2, s, s)
            }
          }
        },
        didDrawPage: (data) => { if (data.pageNumber > 1) drawHeader() },
      })

      const resumoY = (doc as any).lastAutoTable.finalY + 8
      autoTable(doc, {
        startY: resumoY,
        head: [['KM por GPS', 'KM Tacometro', 'Horas Trabalhadas', 'Dias Trabalhados', 'Horas Extras']],
        body: [[`${histSummary.gpsKm.toFixed(1)} km`, histSummary.odometerKm > 0 ? `${histSummary.odometerKm.toFixed(1)} km` : '-', fmtMin(histSummary.totalMinutes), String(histSummary.workDays), extraMin > 0 ? fmtMin(extraMin) : '-']],
        headStyles: { fillColor: [245, 245, 245], textColor: [40, 40, 40], fontStyle: 'bold', lineWidth: 0.3, lineColor: [200, 200, 200], fontSize: 8.5 },
        bodyStyles: { halign: 'center', lineWidth: 0.2, lineColor: [220, 220, 220], fontSize: 9 },
        margin: { left: 14, right: 14 },
      })

      const H = doc.internal.pageSize.height
      let sigY = (doc as any).lastAutoTable.finalY + 20
      if (sigY + 40 > H) { doc.addPage(); drawHeader(); sigY = 70 }
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40)
      doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.4)
      doc.line(14, sigY + 20, 90, sigY + 20); doc.text(empName, 52, sigY + 26, { align: 'center' }); doc.text('Assinatura do Funcionario', 52, sigY + 32, { align: 'center' })
      doc.line(120, sigY + 20, 196, sigY + 20); doc.text('Gestor Responsavel', 158, sigY + 26, { align: 'center' }); doc.text('Assinatura do Gestor', 158, sigY + 32, { align: 'center' })
      doc.save(`extrato-ponto-${empName.replace(/\s+/g, '-')}-${histDateFrom}-${histDateTo}.pdf`)
    } finally { setPdfLoading(false) }
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const today = new Date().toLocaleDateString('en-CA')

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors'
  const labelCls = 'text-xs font-medium text-slate-400 block mb-1.5'

  return (
    <div className="h-screen bg-[#080c14] flex flex-col">

      {selectedEmployeeModal && (
        <EmployeeDayModal
          employee={selectedEmployeeModal}
          date={today}
          workDay={getWorkDay(selectedEmployeeModal.id)}
          onClose={() => setSelectedEmployeeModal(null)}
        />
      )}

      {/* Header */}
      <header className="bg-slate-900/80 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <Zap size={18} className="text-gray-950 fill-gray-950" />
          </div>
          <div>
            <span className="text-white font-bold text-sm">AmperePoint</span>
            <p className="text-xs text-slate-500">Painel do Gestor</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {loading ? <Spinner size="sm" className="text-amber-500" /> : (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium bg-emerald-500/10 px-2 py-1 rounded-lg">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                {inField} em campo
              </span>
              {onLunchEmps.length > 0 && (
                <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg">
                  {onLunchEmps.length} almoço
                </span>
              )}
              {absentEmps.length > 0 && (
                <span className="text-xs font-medium text-red-400 bg-red-500/10 px-2 py-1 rounded-lg">
                  {absentEmps.length} ausente{absentEmps.length > 1 ? 's' : ''}
                </span>
              )}
              {finishedEmps.length > 0 && (
                <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2 py-1 rounded-lg">
                  {finishedEmps.length} saiu
                </span>
              )}
            </div>
          )}
          <button onClick={() => { loadData() }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={15} />
          </button>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-slate-900/60 border-b border-slate-800 flex shrink-0 overflow-x-auto">
        {TABS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2',
              tab === id
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
            )}>
            {icon}{label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-hidden">

        {/* ── MAPA ── */}
        {tab === 'mapa' && (
          <div className="flex h-full">
            <div className={clsx('bg-slate-900/80 overflow-hidden shrink-0 transition-all duration-200', sidebarOpen ? 'w-72' : 'w-0')}>
              <div className="p-3 w-72 h-full overflow-y-auto">
                {/* Unit filter */}
                <div className="flex gap-1 mb-3">
                  {(['all', 'Natal', 'Caruaru'] as UnitFilter[]).map(u => (
                    <button key={u} onClick={() => setUnitFilter(u)}
                      className={clsx('flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors',
                        unitFilter === u ? 'bg-amber-500 text-gray-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                      )}>
                      {u === 'all' ? 'Todos' : u}
                    </button>
                  ))}
                </div>

                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                  Hoje ({filteredEmployees.filter(e => getWorkDay(e.id)).length})
                </p>

                {filteredEmployees.map(emp => {
                  const wd  = getWorkDay(emp.id)
                  const loc = getLoc(emp.id)
                  const punch = lastPunch[emp.id]
                  const onLunch = punch === 'SAIDA_ALMOCO'
                  const finished = wd?.status === 'FORA'
                  const isActive = wd?.status === 'EM_SERVICO' && !onLunch
                  const entradaTs = entrada[emp.id]
                  const elapsed = entradaTs && !finished ? elapsedSince(entradaTs) : null
                  const displayTime = wd?.totalMinutes && wd.totalMinutes > 0
                    ? `${Math.floor(wd.totalMinutes/60)}h${String(wd.totalMinutes%60).padStart(2,'0')}m`
                    : elapsed
                  if (!wd) return null
                  return (
                    <div key={emp.id} className={clsx('rounded-xl mb-2 border transition-colors',
                      selectedUser === emp.id ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    )}>
                      <div className="cursor-pointer p-3 pb-2" onClick={() => setSelectedEmployeeModal({ id: emp.id, name: emp.name, unit: emp.unit })}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-white text-sm hover:text-amber-400 transition-colors truncate mr-2">{emp.name}</span>
                          <Badge variant={finished ? 'default' : onLunch ? 'warning' : isActive ? 'success' : 'default'}>
                            <span className={clsx('w-1.5 h-1.5 rounded-full', isActive ? 'bg-emerald-400' : onLunch ? 'bg-amber-400' : 'bg-slate-500')} />
                            {finished ? 'Saiu' : onLunch ? 'Almoço' : isActive ? 'Campo' : 'Fora'}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mb-1.5">{emp.unit}</p>
                        {displayTime && (
                          <div className="flex gap-3 text-xs">
                            <span className="flex items-center gap-1 text-slate-400">
                              <Clock size={11} />
                              {displayTime}
                              {elapsed && !wd?.totalMinutes && <span className="text-slate-600"> (em curso)</span>}
                            </span>
                          </div>
                        )}
                        {loc && <p className="text-xs text-slate-600 mt-1">Última pos: {fmtTime(loc.timestamp)}</p>}
                      </div>
                      <button onClick={() => loadTrail(emp.id)}
                        className="w-full text-xs text-slate-500 hover:text-amber-400 py-1.5 px-3 border-t border-slate-700/50 transition-colors flex items-center justify-center gap-1">
                        <Map size={11} /> {selectedUser === emp.id ? 'Ocultar rota' : 'Ver rota'}
                      </button>
                    </div>
                  )
                })}

                {/* Absent employees */}
                {filteredEmployees.filter(e => !getWorkDay(e.id)).length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-red-500/70 uppercase tracking-wider mb-2 px-1 flex items-center gap-1">
                      <AlertCircle size={11} /> Ausentes ({filteredEmployees.filter(e => !getWorkDay(e.id)).length})
                    </p>
                    {filteredEmployees.filter(e => !getWorkDay(e.id)).map(emp => (
                      <div key={emp.id} className="rounded-xl mb-2 border border-red-900/30 bg-red-950/20 p-3">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-400 text-sm truncate mr-2">{emp.name}</span>
                          <Badge variant="danger">Ausente</Badge>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{emp.unit}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button onClick={() => setSidebarOpen(o => !o)}
              className="w-5 shrink-0 bg-slate-800 hover:bg-slate-700 border-x border-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors">
              {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>

            <div className="flex-1">
              <MapContainer center={[-5.7945, -35.2110]} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
                {employees.map(emp => {
                  const loc = getLoc(emp.id)
                  const wd  = getWorkDay(emp.id)
                  if (!loc) return null
                  return (
                    <Marker key={emp.id} position={[loc.latitude, loc.longitude]} icon={wd?.status === 'EM_SERVICO' ? greenIcon : grayIcon}>
                      <Popup><p className="font-bold">{emp.name}</p><p>{emp.unit}</p>{wd && <p>{wd.totalKm.toFixed(1)} km hoje</p>}</Popup>
                    </Marker>
                  )
                })}
                {selectedTrail && selectedTrail.length > 1 && (
                  <Polyline positions={selectedTrail} color="#f59e0b" weight={3} opacity={0.85} />
                )}
              </MapContainer>
            </div>
          </div>
        )}

        {/* ── FUNCIONÁRIOS ── */}
        {tab === 'funcionarios' && (
          <div className="flex h-full overflow-hidden">
            {/* sidebar lista */}
            <div className="w-72 border-r border-slate-800 overflow-y-auto p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-1 px-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ativos ({employees.length})</p>
                <Button size="sm" onClick={() => { setEditEmp(null); setShowForm(true); setFormMsg(null) }}>
                  <UserPlus size={14} /> Novo
                </Button>
              </div>

              {employees.map(emp => (
                <div key={emp.id} className={clsx('rounded-xl border p-3 cursor-pointer transition-colors',
                  editEmp?.id === emp.id ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-800/80 border-slate-700 hover:border-slate-600'
                )} onClick={() => openEditEmp(emp)}>
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-white text-sm truncate">{emp.name}</p>
                    <Edit2 size={13} className="text-slate-500 shrink-0 ml-2" />
                  </div>
                  <p className="text-xs text-slate-500 truncate">{emp.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="default">{emp.unit}</Badge>
                    <Badge variant={emp.role === 'MANAGER' ? 'warning' : 'info'}>{emp.role === 'MANAGER' ? 'Gestor' : 'Vendedor'}</Badge>
                  </div>
                </div>
              ))}

              {inactiveEmployees.length > 0 && (
                <div className="mt-2">
                  <button onClick={() => setShowInactive(v => !v)}
                    className="text-xs text-slate-600 hover:text-slate-400 flex items-center gap-1 px-1 mb-2 transition-colors">
                    {showInactive ? <ChevronLeft size={12} /> : <ChevronRight size={12} />} Inativos ({inactiveEmployees.length})
                  </button>
                  {showInactive && inactiveEmployees.map(emp => (
                    <div key={emp.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-2 opacity-60">
                      <p className="text-sm text-slate-400 font-medium">{emp.name}</p>
                      <p className="text-xs text-slate-600 truncate mb-2">{emp.email}</p>
                      <Button size="sm" variant="ghost" onClick={() => reactivateEmp(emp)}>
                        <UserCheck size={13} /> Reativar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* painel direito */}
            <div className="flex-1 overflow-y-auto p-6">
              {!editEmp && !showForm && (
                <>
                  <Card className="p-5 mb-6 max-w-lg">
                    <h3 className="font-semibold text-white mb-1 flex items-center gap-2"><FileText size={16} className="text-amber-400" /> Relatório Mensal</h3>
                    <p className="text-slate-500 text-sm mb-4">Exporta ponto completo do mês em CSV.</p>
                    <div className="flex gap-3">
                      <input type="month" value={exportMonth} onChange={e => setExportMonth(e.target.value)} className={clsx(inputCls, 'flex-1')} />
                      <Button onClick={exportMonthlyCSV} loading={exportLoading} variant="secondary">
                        <Download size={15} /> Exportar
                      </Button>
                    </div>
                  </Card>
                  <div className="text-center py-12 text-slate-600 text-sm">
                    <Users size={32} className="mx-auto mb-3 opacity-30" />
                    Selecione um funcionário para editar ou cadastre um novo.
                  </div>
                </>
              )}

              {showForm && !editEmp && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-700">
                      <ChevronLeft size={18} />
                    </button>
                    <h2 className="text-lg font-bold text-white">Novo Funcionário</h2>
                  </div>
                  <form onSubmit={submitNewEmp} className="max-w-lg flex flex-col gap-4">
                    {formMsg && (
                      <div className={clsx('flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium',
                        formMsg.type === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                      )}>
                        {formMsg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {formMsg.text}
                      </div>
                    )}
                    <Input label="Nome completo *" placeholder="João Silva" value={empForm.name} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))} required />
                    <Input label="E-mail *" type="email" placeholder="joao@ampere.com" value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} required />
                    <Input label="Senha inicial *" type="password" placeholder="Mínimo 6 caracteres" value={empForm.password} onChange={e => setEmpForm(f => ({ ...f, password: e.target.value }))} required />
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={labelCls}>Função</label><select value={empForm.role} onChange={e => setEmpForm(f => ({ ...f, role: e.target.value }))} className={inputCls}><option value="EMPLOYEE">Vendedor</option><option value="MANAGER">Gestor</option><option value="ADMIN">Admin</option></select></div>
                      <div><label className={labelCls}>Unidade</label><select value={empForm.unit} onChange={e => setEmpForm(f => ({ ...f, unit: e.target.value }))} className={inputCls}><option value="Natal">Natal</option><option value="Caruaru">Caruaru</option></select></div>
                    </div>
                    <Input label="Telefone" placeholder="(84) 99999-9999" value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="CPF" placeholder="000.000.000-00" value={empForm.cpf} onChange={e => setEmpForm(f => ({ ...f, cpf: e.target.value }))} />
                      <Input label="PIS" placeholder="000.00000.00-0" value={empForm.pis} onChange={e => setEmpForm(f => ({ ...f, pis: e.target.value }))} />
                    </div>
                    <Button type="submit" fullWidth loading={formLoading}><UserPlus size={16} /> Cadastrar Funcionário</Button>
                  </form>
                </>
              )}

              {editEmp && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <button onClick={() => setEditEmp(null)} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-700">
                      <ChevronLeft size={18} />
                    </button>
                    <h2 className="text-lg font-bold text-white">Editando: {editEmp.name}</h2>
                  </div>
                  <form onSubmit={submitEditEmp} className="max-w-lg flex flex-col gap-4">
                    {formMsg && (
                      <div className={clsx('flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium',
                        formMsg.type === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                      )}>
                        {formMsg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {formMsg.text}
                      </div>
                    )}
                    <Input label="Nome completo *" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required />
                    <Input label="E-mail" value={editForm.email} disabled />
                    <Input label="Nova senha (deixe em branco para manter)" type="password" placeholder="••••••" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={labelCls}>Função</label><select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className={inputCls}><option value="EMPLOYEE">Vendedor</option><option value="MANAGER">Gestor</option><option value="ADMIN">Admin</option></select></div>
                      <div><label className={labelCls}>Unidade</label><select value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} className={inputCls}><option value="Natal">Natal</option><option value="Caruaru">Caruaru</option></select></div>
                    </div>
                    <Input label="Telefone" placeholder="(84) 99999-9999" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="CPF" placeholder="000.000.000-00" value={editForm.cpf} onChange={e => setEditForm(f => ({ ...f, cpf: e.target.value }))} />
                      <Input label="PIS" placeholder="000.00000.00-0" value={editForm.pis} onChange={e => setEditForm(f => ({ ...f, pis: e.target.value }))} />
                    </div>
                    <div className="flex gap-3">
                      <Button type="submit" loading={formLoading} className="flex-1">Salvar Alterações</Button>
                      <Button type="button" variant="danger" onClick={inactivateEmp}><UserX size={16} /> Inativar</Button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── PONTOS & FOTOS ── */}
        {tab === 'pontos' && (
          <div className="h-full overflow-y-auto p-4">
            {zoomedPhoto && (
              <div onClick={() => setZoomedPhoto(null)} className="fixed inset-0 bg-black/95 flex items-center justify-center cursor-zoom-out z-50 backdrop-blur-sm">
                <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"><X size={20} /></button>
                <img src={zoomedPhoto} alt="Foto ampliada" className="max-w-full max-h-full rounded-xl shadow-2xl" />
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Camera size={20} className="text-amber-400" /> Registros de Ponto
              </h2>
              <div className="flex items-center gap-2">
                <input type="date" value={punchDate} max={today} onChange={e => setPunchDate(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors" />
                <Button size="sm" variant="secondary" onClick={() => loadPunchesByDate(punchDate)} loading={punchesLoading}>
                  <RefreshCw size={14} />
                </Button>
              </div>
            </div>

            {punchesLoading ? (
              <div className="flex justify-center py-16"><Spinner size="lg" className="text-amber-500" /></div>
            ) : allPunches.length === 0 ? (
              <div className="text-center py-16 text-slate-600">
                <Clock size={32} className="mx-auto mb-3 opacity-30" />
                <p>Nenhum ponto registrado nesta data.</p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {allPunches.map((punch: any) => (
                  <Card key={punch.id} className="overflow-hidden">
                    {punch.photoUrl ? (
                      <div className="cursor-zoom-in relative" onClick={() => setZoomedPhoto(photoUrl(punch.photoUrl))}>
                        <img src={photoUrl(punch.photoUrl)} alt="Selfie" className="w-full object-cover h-44"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <Search size={11} /> Ampliar
                        </div>
                      </div>
                    ) : (
                      <div className="h-32 flex items-center justify-center bg-slate-800 text-slate-600 text-sm gap-2">
                        <Camera size={20} className="opacity-40" /> Sem foto
                      </div>
                    )}
                    <div className="p-3">
                      <p className="font-semibold text-white text-sm">{punch.user?.name ?? '—'}</p>
                      <p className="text-xs text-slate-500 mb-2">{punch.user?.unit}</p>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={PUNCH_BADGE_VARIANT[punch.type] ?? 'default'}>{PUNCH_LABELS[punch.type] ?? punch.type}</Badge>
                        <span className="text-xs text-slate-500 tabular-nums">{fmtTime(punch.timestamp)}</span>
                      </div>
                      {punch.latitude != null && punch.longitude != null ? (
                        <a href={`https://www.google.com/maps?q=${punch.latitude},${punch.longitude}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-slate-800 px-2.5 py-1.5 rounded-lg transition-colors">
                          <MapPin size={12} /> Ver localização
                        </a>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-slate-600">
                          <MapPin size={12} className="opacity-40" /> Sem localização (ponto manual)
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── HISTÓRICO ── */}
        {tab === 'historico' && (
          <div className="flex h-full overflow-hidden">
            <div className="w-80 shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-900/40">
              <div className="p-4 border-b border-slate-800 shrink-0">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <History size={16} className="text-amber-400" /> Histórico por Funcionário
                </h3>
                <div className="flex flex-col gap-2">
                  <select value={histEmployee} onChange={e => setHistEmployee(e.target.value)} className={inputCls}>
                    <option value="">Selecione o funcionário...</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.unit}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={labelCls}>De</label><input type="date" value={histDateFrom} max={histDateTo} onChange={e => setHistDateFrom(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>Até</label><input type="date" value={histDateTo} min={histDateFrom} max={today} onChange={e => setHistDateTo(e.target.value)} className={inputCls} /></div>
                  </div>
                  <Button fullWidth onClick={loadHistorico} disabled={!histEmployee} loading={histLoading}>
                    <Search size={15} /> {histLoading ? 'Buscando...' : 'Buscar'}
                  </Button>
                </div>

                {histSummary && (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {[
                        { label: 'KM GPS', value: `${histSummary.gpsKm.toFixed(1)} km`, color: 'text-blue-400' },
                        { label: 'KM Odôm.', value: histSummary.odometerKm > 0 ? `${histSummary.odometerKm.toFixed(1)} km` : '—', color: 'text-amber-400' },
                        { label: 'Horas', value: fmtMin(histSummary.totalMinutes), color: 'text-white' },
                        { label: 'Dias', value: String(histSummary.workDays), color: 'text-white' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-slate-800 rounded-xl p-2.5 text-center">
                          <p className="text-xs text-slate-500 mb-1">{label}</p>
                          <p className={clsx('font-bold text-sm', color)}>{value}</p>
                        </div>
                      ))}
                    </div>
                    <Button fullWidth variant="secondary" className="mt-3" onClick={exportHistoricoPDF} loading={pdfLoading}>
                      <FileText size={15} /> {pdfLoading ? 'Gerando PDF...' : 'Exportar PDF'}
                    </Button>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {!histSummary && !histLoading && (
                  <p className="text-slate-600 text-sm text-center py-8">Selecione funcionário e período.</p>
                )}
                {histLoading && <div className="flex justify-center py-8"><Spinner className="text-amber-500" /></div>}
                {!histLoading && histSummary && histPunches.length === 0 && (
                  <p className="text-slate-600 text-sm text-center py-8">Nenhum ponto neste período.</p>
                )}
                {(() => {
                  const byDay: Record<string, any[]> = {}
                  histPunches.forEach(p => {
                    const day = fmtDate(p.timestamp)
                    if (!byDay[day]) byDay[day] = []
                    byDay[day].push(p)
                  })
                  return Object.entries(byDay).map(([day, punches]) => (
                    <div key={day} className="mb-4">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2 px-1">{day}</p>
                      {punches.map((punch: any) => (
                        <Card key={punch.id} className="overflow-hidden mb-2">
                          {punch.photoUrl && (
                            <div className="cursor-zoom-in relative" onClick={() => setZoomedPhoto(photoUrl(punch.photoUrl))}>
                              <img src={photoUrl(punch.photoUrl)} alt="Selfie" className="w-full object-cover h-24"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-full"><Search size={10} /></div>
                            </div>
                          )}
                          <div className="p-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <Badge variant={PUNCH_BADGE_VARIANT[punch.type] ?? 'default'}>{PUNCH_LABELS[punch.type] ?? punch.type}</Badge>
                              <span className="text-xs text-slate-500 tabular-nums">{fmtTime(punch.timestamp)}</span>
                            </div>
                            {punch.odometerKm != null && (
                              <p className="text-xs text-amber-400 mb-1 flex items-center gap-1"><Car size={11} /> {punch.odometerKm} km</p>
                            )}
                            {punch.latitude != null && punch.longitude != null ? (
                              <a href={`https://www.google.com/maps?q=${punch.latitude},${punch.longitude}`} target="_blank" rel="noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                                <MapPin size={11} /> Ver no Maps
                              </a>
                            ) : (
                              <span className="text-xs text-slate-600 flex items-center gap-1">
                                <MapPin size={11} className="opacity-40" /> Sem localização (ponto manual)
                              </span>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  ))
                })()}
              </div>
            </div>

            <div className="flex-1 relative">
              <MapContainer center={[-5.7945, -35.2110]} zoom={12} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
                {histTrail && histTrail.length > 1 && (
                  <>
                    <FitTrail trail={histTrail} />
                    <Polyline positions={histTrail} color="#f59e0b" weight={4} opacity={0.9} />
                    <Marker position={histTrail[0]} icon={greenIcon}><Popup>Início</Popup></Marker>
                    <Marker position={histTrail[histTrail.length - 1]} icon={grayIcon}><Popup>Fim</Popup></Marker>
                  </>
                )}
                {histPunches.filter((punch: any) => punch.latitude != null && punch.longitude != null).map((punch: any) => (
                  <Marker key={punch.id} position={[punch.latitude, punch.longitude]}>
                    <Popup>
                      <p className="font-bold text-sm">{PUNCH_LABELS[punch.type]}</p>
                      <p className="text-xs text-gray-500">{fmtTime(punch.timestamp)}</p>
                      {punch.odometerKm != null && <p className="text-xs">{punch.odometerKm} km</p>}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
              {!histTrail && !histLoading && histEmployee && histSummary && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
                  <div className="bg-slate-900/90 border border-slate-700 text-slate-400 text-sm px-4 py-2 rounded-xl backdrop-blur-sm">
                    Sem dados de GPS para este período
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RASTREAMENTO ── */}
        {tab === 'rh' && (
          <div className="p-4">
            <HRPanel employees={employees} />
          </div>
        )}

        {tab === 'rastreamento' && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <Radio size={20} className="text-amber-400" /> Rastreamento em Segundo Plano
              </h2>
              <p className="text-slate-500 text-sm mb-6">Configure o <strong className="text-slate-300">OwnTracks</strong> para rastrear com tela desligada.</p>

              {/* Passos comuns */}
              <Card className="p-5 mb-4">
                <h3 className="font-semibold text-white mb-4">Configuração inicial (iOS e Android)</h3>
                <ol className="space-y-3 text-sm text-slate-400">
                  {[
                    'Baixe o <strong class="text-white">OwnTracks</strong> na App Store ou Play Store (gratuito)',
                    'Abra o app → toque no ícone <strong class="text-white">(i)</strong> no canto superior esquerdo → <strong class="text-white">Configurações</strong>',
                    'Em <strong class="text-white">Mode</strong>, selecione <strong class="text-white">HTTP</strong>',
                    'Em <strong class="text-white">URL</strong>, cole o link do funcionário (seção abaixo)',
                    'No app, selecione o modo <strong class="text-white">Move</strong> e deixe rodando em segundo plano',
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="bg-amber-500 text-gray-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <span dangerouslySetInnerHTML={{ __html: step }} />
                    </li>
                  ))}
                </ol>
              </Card>

              {/* iOS vs Android */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg"></span>
                    <h3 className="font-semibold text-white text-sm">iPhone (iOS)</h3>
                  </div>
                  <ol className="space-y-2 text-xs text-slate-400">
                    {[
                      'Abra <strong class="text-white">Ajustes</strong> do iPhone',
                      'Role até encontrar <strong class="text-white">OwnTracks</strong>',
                      'Toque em <strong class="text-white">Localização</strong>',
                      'Selecione <strong class="text-white">Sempre</strong>',
                      'Ative <strong class="text-white">Localização Precisa</strong>',
                    ].map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="bg-slate-700 text-slate-300 text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <span dangerouslySetInnerHTML={{ __html: step }} />
                      </li>
                    ))}
                  </ol>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🤖</span>
                    <h3 className="font-semibold text-white text-sm">Android</h3>
                  </div>
                  <ol className="space-y-2 text-xs text-slate-400">
                    {[
                      'Abra <strong class="text-white">Configurações</strong> do celular',
                      'Vá em <strong class="text-white">Aplicativos → OwnTracks</strong>',
                      'Toque em <strong class="text-white">Permissões → Localização</strong>',
                      'Selecione <strong class="text-white">Permitir o tempo todo</strong>',
                      'Em <strong class="text-white">Bateria</strong>, selecione <strong class="text-white">Sem restrições</strong>',
                    ].map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="bg-slate-700 text-slate-300 text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <span dangerouslySetInnerHTML={{ __html: step }} />
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>

              <h3 className="font-semibold text-white mb-3 flex items-center gap-2"><Navigation size={16} className="text-amber-400" /> URLs por Funcionário</h3>
              <div className="space-y-3">
                {employees.map(emp => {
                  const url = `${API_BASE}/api/gps-ext/${emp.id}?token=${emp.gpsToken ?? ''}`
                  const copied = copiedUrl === url
                  return (
                    <Card key={emp.id} className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-white text-sm">{emp.name}</p>
                          <p className="text-xs text-slate-500">{emp.unit}</p>
                        </div>
                        <Button size="sm" variant={copied ? 'success' : 'secondary'} onClick={() => copyUrl(url)}>
                          {copied ? <><CheckCircle2 size={13} /> Copiado!</> : <><Copy size={13} /> Copiar URL</>}
                        </Button>
                      </div>
                      <code className="block text-xs text-amber-400 bg-slate-800 rounded-xl px-3 py-2 break-all">{url}</code>
                    </Card>
                  )
                })}
              </div>

              <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm">
                <p className="font-semibold text-amber-400 mb-1">Dica de bateria</p>
                <p className="text-amber-400/70 text-xs">Use o modo <strong>Significant</strong> para economizar bateria ou <strong>Move</strong> para rastreamento frequente.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
