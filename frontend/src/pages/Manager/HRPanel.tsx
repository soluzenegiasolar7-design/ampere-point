import { useEffect, useState } from 'react'
import { FileText, AlertCircle, Umbrella, Coffee, Clock, TrendingUp, Upload, Check, X, Pencil, Trash2, Search, Wrench } from 'lucide-react'
import { api } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { HourBankList } from '../../components/shared/HourBankList'

type HRTab = 'holerites' | 'ausencias' | 'ferias' | 'folgas' | 'ajustes' | 'banco'

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function statusBadge(s: string) {
  if (s === 'APPROVED') return <Badge variant="success">Aprovado</Badge>
  if (s === 'REJECTED') return <Badge variant="danger">Rejeitado</Badge>
  return <Badge variant="warning">Pendente</Badge>
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR')
}

interface Employee { id: string; name: string; unit?: string }

interface Props {
  employees: Employee[]
}

const inputCls = 'bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-orange-500 w-full'
const labelCls = 'text-xs text-slate-500 block mb-1'

export default function HRPanel({ employees }: Props) {
  const [tab, setTab] = useState<HRTab>('holerites')
  const [loading, setLoading] = useState(false)

  // Holerites
  const [payslipUserId, setPayslipUserId] = useState('')
  const [payslipMonth, setPayslipMonth] = useState(String(new Date().getMonth() + 1))
  const [payslipYear, setPayslipYear] = useState(String(new Date().getFullYear()))
  const [payslipFile, setPayslipFile] = useState<File | null>(null)
  const [payslipMsg, setPayslipMsg] = useState('')
  const [payslipLoading, setPayslipLoading] = useState(false)

  // Ausências
  const [absences, setAbsences] = useState<any[]>([])
  const [absUserId, setAbsUserId] = useState('')
  const [absDate, setAbsDate] = useState('')
  const [absType, setAbsType] = useState('FALTA')
  const [absReason, setAbsReason] = useState('')

  // Férias
  const [vacations, setVacations] = useState<any[]>([])
  const [vacUserId, setVacUserId] = useState('')
  const [vacStart, setVacStart] = useState('')
  const [vacEnd, setVacEnd] = useState('')
  const [vacNotes, setVacNotes] = useState('')

  // Folgas
  const [dayOffs, setDayOffs] = useState<any[]>([])
  const [doffUserId, setDoffUserId] = useState('')
  const [doffDate, setDoffDate] = useState('')
  const [doffReason, setDoffReason] = useState('')

  // Ajustes
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [adjFilter, setAdjFilter] = useState('PENDING')

  // Correção direta de ponto
  const [corrUserId, setCorrUserId] = useState('')
  const [corrDate, setCorrDate] = useState(new Date().toISOString().slice(0, 10))
  const [corrEntries, setCorrEntries] = useState<any[]>([])
  const [corrLoading, setCorrLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTime, setEditingTime] = useState('')

  // Banco de horas
  const [hourBank, setHourBank] = useState<any[]>([])
  const [bankFrom, setBankFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [bankTo, setBankTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [bankAdjUserId, setBankAdjUserId] = useState('')
  const [bankAdjHours, setBankAdjHours] = useState('')
  const [bankAdjDate, setBankAdjDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [bankAdjReason, setBankAdjReason] = useState('')
  const [bankAdjLoading, setBankAdjLoading] = useState(false)

  useEffect(() => { loadTab() }, [tab, adjFilter])

  async function loadTab() {
    setLoading(true)
    try {
      if (tab === 'ausencias') {
        const r = await api.get('/api/absences')
        setAbsences(r.data)
      } else if (tab === 'ferias') {
        const r = await api.get('/api/vacations')
        setVacations(r.data)
      } else if (tab === 'folgas') {
        const r = await api.get('/api/day-offs')
        setDayOffs(r.data)
      } else if (tab === 'ajustes') {
        const r = await api.get(`/api/time-adjustments?status=${adjFilter}`)
        setAdjustments(r.data)
      } else if (tab === 'banco') {
        const r = await api.get(`/api/hour-bank/team?dateFrom=${bankFrom}&dateTo=${bankTo}`)
        setHourBank(r.data)
      }
    } catch {}
    setLoading(false)
  }

  async function uploadPayslip(e: React.FormEvent) {
    e.preventDefault()
    if (!payslipFile || !payslipUserId) return
    setPayslipLoading(true)
    setPayslipMsg('')
    const fd = new FormData()
    fd.append('userId', payslipUserId)
    fd.append('month', payslipMonth)
    fd.append('year', payslipYear)
    fd.append('file', payslipFile)
    try {
      await api.post('/api/payslips', fd)
      setPayslipMsg('Holerite enviado com sucesso!')
      setPayslipFile(null)
    } catch {
      setPayslipMsg('Erro ao enviar holerite')
    } finally {
      setPayslipLoading(false)
    }
  }

  async function createAbsence(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/api/absences', { userId: absUserId, date: absDate, type: absType, reason: absReason || undefined })
      setAbsDate(''); setAbsReason(''); loadTab()
    } catch {}
  }

  async function createVacation(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/api/vacations', { userId: vacUserId, startDate: vacStart, endDate: vacEnd, notes: vacNotes || undefined })
      setVacStart(''); setVacEnd(''); setVacNotes(''); loadTab()
    } catch {}
  }

  async function createDayOff(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/api/day-offs', { userId: doffUserId, date: doffDate, reason: doffReason || undefined })
      setDoffDate(''); setDoffReason(''); loadTab()
    } catch {}
  }

  const brtTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' })

  async function loadCorrEntries() {
    if (!corrUserId || !corrDate) return
    setCorrLoading(true)
    try {
      const r = await api.get(`/api/time-entries/user/${corrUserId}?date=${corrDate}T12:00:00Z`)
      setCorrEntries(r.data)
    } catch {} finally { setCorrLoading(false) }
  }

  async function deleteEntryDirect(id: string) {
    if (!window.confirm('Deletar este ponto? O funcionário poderá bater novamente.')) return
    try {
      await api.delete(`/api/time-entries/${id}`)
      setCorrEntries(prev => prev.filter(e => e.id !== id))
    } catch {}
  }

  async function saveEntryTime(id: string) {
    if (!editingTime) return
    try {
      await api.patch(`/api/time-entries/${id}`, { timestamp: `${corrDate}T${editingTime}:00-03:00` })
      setEditingId(null)
      loadCorrEntries()
    } catch {}
  }

  async function reviewItem(endpoint: string, id: string, status: 'APPROVED' | 'REJECTED') {
    try {
      await api.patch(`${endpoint}/${id}/review`, { status })
      loadTab()
    } catch {}
  }

  async function createBankAdjustment(e: React.FormEvent) {
    e.preventDefault()
    if (!bankAdjUserId || !bankAdjHours || !bankAdjReason) return
    setBankAdjLoading(true)
    try {
      await api.post('/api/hour-bank/adjustments', {
        userId: bankAdjUserId,
        minutes: Math.round(Number(bankAdjHours) * 60),
        date: bankAdjDate,
        reason: bankAdjReason,
      })
      setBankAdjHours(''); setBankAdjReason('')
      loadTab()
    } catch {} finally { setBankAdjLoading(false) }
  }

  const TABS_HR: { id: HRTab; label: string; icon: React.ReactNode }[] = [
    { id: 'holerites', label: 'Holerites', icon: <FileText size={13} /> },
    { id: 'ausencias', label: 'Ausências', icon: <AlertCircle size={13} /> },
    { id: 'ferias',    label: 'Férias',    icon: <Umbrella size={13} /> },
    { id: 'folgas',    label: 'Folgas',    icon: <Coffee size={13} /> },
    { id: 'ajustes',   label: 'Ajustes',   icon: <Clock size={13} /> },
    { id: 'banco',     label: 'Banco H.',  icon: <TrendingUp size={13} /> },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS_HR.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-orange-600 text-black' : 'bg-slate-50 text-slate-500 hover:text-slate-900'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {/* ── HOLERITES ── */}
      {!loading && tab === 'holerites' && (
        <div className="space-y-4">
          <form onSubmit={uploadPayslip} className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Upload size={14} className="text-orange-600" /> Enviar Holerite
            </p>
            <div>
              <label className={labelCls}>Funcionário</label>
              <select value={payslipUserId} onChange={e => setPayslipUserId(e.target.value)} className={inputCls} required>
                <option value="">Selecionar...</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Mês</label>
                <select value={payslipMonth} onChange={e => setPayslipMonth(e.target.value)} className={inputCls}>
                  {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Ano</label>
                <input type="number" value={payslipYear} onChange={e => setPayslipYear(e.target.value)} className={inputCls} min="2020" max="2035" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Arquivo PDF</label>
              <input type="file" accept=".pdf" onChange={e => setPayslipFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-orange-100 file:text-orange-600 file:text-xs hover:file:bg-orange-100 cursor-pointer" />
            </div>
            {payslipMsg && (
              <p className={`text-xs ${payslipMsg.includes('sucesso') ? 'text-green-700' : 'text-red-600'}`}>{payslipMsg}</p>
            )}
            <Button type="submit" size="sm" loading={payslipLoading}><Upload size={14} /> Enviar</Button>
          </form>
        </div>
      )}

      {/* ── AUSÊNCIAS ── */}
      {!loading && tab === 'ausencias' && (
        <div className="space-y-4">
          <form onSubmit={createAbsence} className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Lançar Ausência</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Funcionário</label>
                <select value={absUserId} onChange={e => setAbsUserId(e.target.value)} className={inputCls} required>
                  <option value="">Selecionar...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Data</label><input type="date" value={absDate} onChange={e => setAbsDate(e.target.value)} className={inputCls} required /></div>
              <div>
                <label className={labelCls}>Tipo</label>
                <select value={absType} onChange={e => setAbsType(e.target.value)} className={inputCls}>
                  <option value="FALTA">Falta</option>
                  <option value="ATESTADO">Atestado</option>
                  <option value="ABONADA">Abonada</option>
                </select>
              </div>
            </div>
            <input type="text" placeholder="Motivo (opcional)" value={absReason} onChange={e => setAbsReason(e.target.value)} className={inputCls} />
            <Button type="submit" size="sm">Lançar</Button>
          </form>
          <div className="space-y-2">
            {absences.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{a.user?.name}</p>
                  <p className="text-xs text-slate-500">{fmtDate(a.date)} · {a.type}{a.reason ? ` · ${a.reason}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(a.status)}
                  {a.status === 'PENDING' && (
                    <>
                      <button onClick={() => reviewItem('/api/absences', a.id, 'APPROVED')} className="p-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"><Check size={13} /></button>
                      <button onClick={() => reviewItem('/api/absences', a.id, 'REJECTED')} className="p-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"><X size={13} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {absences.length === 0 && <p className="text-slate-500 text-sm text-center py-6">Nenhuma ausência registrada</p>}
          </div>
        </div>
      )}

      {/* ── FÉRIAS ── */}
      {!loading && tab === 'ferias' && (
        <div className="space-y-4">
          <form onSubmit={createVacation} className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Agendar Férias</p>
            <div>
              <label className={labelCls}>Funcionário</label>
              <select value={vacUserId} onChange={e => setVacUserId(e.target.value)} className={inputCls} required>
                <option value="">Selecionar...</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Início</label><input type="date" value={vacStart} onChange={e => setVacStart(e.target.value)} className={inputCls} required /></div>
              <div><label className={labelCls}>Fim</label><input type="date" value={vacEnd} onChange={e => setVacEnd(e.target.value)} className={inputCls} required /></div>
            </div>
            <input type="text" placeholder="Observações (opcional)" value={vacNotes} onChange={e => setVacNotes(e.target.value)} className={inputCls} />
            <Button type="submit" size="sm">Agendar</Button>
          </form>
          <div className="space-y-2">
            {vacations.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{v.user?.name}</p>
                  <p className="text-xs text-slate-500">{fmtDate(v.startDate)} → {fmtDate(v.endDate)}{v.notes ? ` · ${v.notes}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(v.status)}
                  {v.status === 'PENDING' && (
                    <>
                      <button onClick={() => reviewItem('/api/vacations', v.id, 'APPROVED')} className="p-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"><Check size={13} /></button>
                      <button onClick={() => reviewItem('/api/vacations', v.id, 'REJECTED')} className="p-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"><X size={13} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {vacations.length === 0 && <p className="text-slate-500 text-sm text-center py-6">Nenhuma férias agendada</p>}
          </div>
        </div>
      )}

      {/* ── FOLGAS ── */}
      {!loading && tab === 'folgas' && (
        <div className="space-y-4">
          <form onSubmit={createDayOff} className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Lançar Folga</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Funcionário</label>
                <select value={doffUserId} onChange={e => setDoffUserId(e.target.value)} className={inputCls} required>
                  <option value="">Selecionar...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Data</label><input type="date" value={doffDate} onChange={e => setDoffDate(e.target.value)} className={inputCls} required /></div>
            </div>
            <input type="text" placeholder="Motivo (opcional)" value={doffReason} onChange={e => setDoffReason(e.target.value)} className={inputCls} />
            <Button type="submit" size="sm">Lançar</Button>
          </form>
          <div className="space-y-2">
            {dayOffs.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{d.user?.name}</p>
                  <p className="text-xs text-slate-500">{fmtDate(d.date)}{d.reason ? ` · ${d.reason}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(d.status)}
                  {d.status === 'PENDING' && (
                    <>
                      <button onClick={() => reviewItem('/api/day-offs', d.id, 'APPROVED')} className="p-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"><Check size={13} /></button>
                      <button onClick={() => reviewItem('/api/day-offs', d.id, 'REJECTED')} className="p-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"><X size={13} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {dayOffs.length === 0 && <p className="text-slate-500 text-sm text-center py-6">Nenhuma folga registrada</p>}
          </div>
        </div>
      )}

      {/* ── AJUSTES DE PONTO ── */}
      {!loading && tab === 'ajustes' && (
        <div className="space-y-4">

          {/* Correção direta */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Wrench size={14} className="text-orange-600" /> Correção Direta de Ponto
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Funcionário</label>
                <select value={corrUserId} onChange={e => setCorrUserId(e.target.value)} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Data</label>
                <input type="date" value={corrDate} onChange={e => setCorrDate(e.target.value)} className={inputCls} />
              </div>
            </div>
            <Button size="sm" onClick={loadCorrEntries} loading={corrLoading} disabled={!corrUserId}>
              <Search size={13} /> Buscar Pontos
            </Button>

            {corrEntries.length > 0 && (
              <div className="space-y-2 pt-1">
                {corrEntries.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between bg-slate-100 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-600 w-28">
                        {e.type === 'ENTRADA' ? 'Entrada' : e.type === 'SAIDA_ALMOCO' ? 'Saída Almoço' : e.type === 'RETORNO_ALMOCO' ? 'Retorno Almoço' : 'Saída'}
                      </span>
                      {editingId === e.id ? (
                        <input
                          type="time" value={editingTime}
                          onChange={ev => setEditingTime(ev.target.value)}
                          className="bg-slate-50 border border-orange-500 rounded-lg px-2 py-1 text-slate-900 text-sm focus:outline-none w-24"
                        />
                      ) : (
                        <span className="text-emerald-700 font-mono font-bold text-sm">{brtTime(e.timestamp)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {editingId === e.id ? (
                        <>
                          <button onClick={() => saveEntryTime(e.id)}
                            className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => { setEditingId(e.id); setEditingTime(brtTime(e.timestamp)) }}
                          className="p-1.5 rounded-lg bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors">
                          <Pencil size={13} />
                        </button>
                      )}
                      <button onClick={() => deleteEntryDirect(e.id)}
                        className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                {corrEntries.length < 4 && (
                  <p className="text-xs text-slate-500 text-center pt-1">
                    Próximo ponto do funcionário: <span className="text-orange-600 font-medium">
                      {['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA'][corrEntries.length] ?? '—'}
                    </span>
                  </p>
                )}
              </div>
            )}
            {corrEntries.length === 0 && corrUserId && !corrLoading && (
              <p className="text-xs text-slate-500 text-center">Nenhum ponto encontrado para essa data</p>
            )}
          </div>

          <hr className="border-slate-200" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Solicitações dos Funcionários</p>

          <div className="flex gap-2 flex-wrap">
            {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
              <button key={s} onClick={() => setAdjFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  adjFilter === s ? 'bg-orange-600 text-black' : 'bg-slate-50 text-slate-500 hover:text-slate-900'
                }`}>
                {s === 'PENDING' ? 'Pendentes' : s === 'APPROVED' ? 'Aprovados' : 'Rejeitados'}
              </button>
            ))}
          </div>
          {adjustments.map((a: any) => (
            <div key={a.id} className="bg-slate-50 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">{a.user?.name}</p>
                {statusBadge(a.status)}
              </div>
              <p className="text-xs text-slate-500">
                {fmtDate(a.date)} · {a.punchType} → {new Date(a.requestedTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-xs text-slate-600">{a.reason}</p>
              {a.status === 'PENDING' && (
                <div className="flex gap-2 pt-0.5">
                  <button onClick={() => reviewItem('/api/time-adjustments', a.id, 'APPROVED')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-100 text-green-700 text-xs hover:bg-green-200 transition-colors">
                    <Check size={12} /> Aprovar
                  </button>
                  <button onClick={() => reviewItem('/api/time-adjustments', a.id, 'REJECTED')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 text-red-600 text-xs hover:bg-red-200 transition-colors">
                    <X size={12} /> Rejeitar
                  </button>
                </div>
              )}
              {a.reviewNote && <p className="text-xs text-slate-500 italic">{a.reviewNote}</p>}
            </div>
          ))}
          {adjustments.length === 0 && <p className="text-slate-500 text-sm text-center py-6">Nenhuma solicitação</p>}
        </div>
      )}

      {/* ── BANCO DE HORAS ── */}
      {!loading && tab === 'banco' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className={labelCls}>De</label>
              <input type="date" value={bankFrom} onChange={e => setBankFrom(e.target.value)} className={inputCls + ' w-36'} />
            </div>
            <div>
              <label className={labelCls}>Até</label>
              <input type="date" value={bankTo} onChange={e => setBankTo(e.target.value)} className={inputCls + ' w-36'} />
            </div>
            <Button size="sm" onClick={loadTab}>Atualizar</Button>
          </div>

          <form onSubmit={createBankAdjustment} className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Lançar Ajuste Manual</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Funcionário</label>
                <select value={bankAdjUserId} onChange={e => setBankAdjUserId(e.target.value)} className={inputCls} required>
                  <option value="">Selecionar...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Horas (+/-)</label>
                <input type="number" step="0.5" placeholder="ex: -2 ou 3.5" value={bankAdjHours}
                  onChange={e => setBankAdjHours(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Data</label>
                <input type="date" value={bankAdjDate} onChange={e => setBankAdjDate(e.target.value)} className={inputCls} required />
              </div>
            </div>
            <input type="text" placeholder="Motivo do ajuste" value={bankAdjReason}
              onChange={e => setBankAdjReason(e.target.value)} className={inputCls} required minLength={5} />
            <Button type="submit" size="sm" loading={bankAdjLoading}>Lançar Ajuste</Button>
          </form>

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Clock size={13} /> Saldo do Banco de Horas
          </p>
          <HourBankList data={hourBank} />
        </div>
      )}
    </div>
  )
}
