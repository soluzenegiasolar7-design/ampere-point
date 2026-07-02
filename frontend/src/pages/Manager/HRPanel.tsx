import { useEffect, useState } from 'react'
import { FileText, AlertCircle, Umbrella, Coffee, Clock, TrendingUp, Upload, Check, X, Pencil, Trash2, Search, Wrench } from 'lucide-react'
import { api } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'

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

const inputCls = 'bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 w-full'
const labelCls = 'text-xs text-slate-400 block mb-1'

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
              tab === t.id ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {/* ── HOLERITES ── */}
      {!loading && tab === 'holerites' && (
        <div className="space-y-4">
          <form onSubmit={uploadPayslip} className="bg-slate-800/50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Upload size={14} className="text-amber-400" /> Enviar Holerite
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
                className="w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500/20 file:text-amber-400 file:text-xs hover:file:bg-amber-500/30 cursor-pointer" />
            </div>
            {payslipMsg && (
              <p className={`text-xs ${payslipMsg.includes('sucesso') ? 'text-green-400' : 'text-red-400'}`}>{payslipMsg}</p>
            )}
            <Button type="submit" size="sm" loading={payslipLoading}><Upload size={14} /> Enviar</Button>
          </form>
        </div>
      )}

      {/* ── AUSÊNCIAS ── */}
      {!loading && tab === 'ausencias' && (
        <div className="space-y-4">
          <form onSubmit={createAbsence} className="bg-slate-800/50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-white">Lançar Ausência</p>
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
              <div key={a.id} className="flex items-center justify-between bg-slate-800/40 rounded-xl p-3">
                <div>
                  <p className="text-sm font-medium text-white">{a.user?.name}</p>
                  <p className="text-xs text-slate-400">{fmtDate(a.date)} · {a.type}{a.reason ? ` · ${a.reason}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(a.status)}
                  {a.status === 'PENDING' && (
                    <>
                      <button onClick={() => reviewItem('/api/absences', a.id, 'APPROVED')} className="p-1 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"><Check size={13} /></button>
                      <button onClick={() => reviewItem('/api/absences', a.id, 'REJECTED')} className="p-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"><X size={13} /></button>
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
          <form onSubmit={createVacation} className="bg-slate-800/50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-white">Agendar Férias</p>
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
              <div key={v.id} className="flex items-center justify-between bg-slate-800/40 rounded-xl p-3">
                <div>
                  <p className="text-sm font-medium text-white">{v.user?.name}</p>
                  <p className="text-xs text-slate-400">{fmtDate(v.startDate)} → {fmtDate(v.endDate)}{v.notes ? ` · ${v.notes}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(v.status)}
                  {v.status === 'PENDING' && (
                    <>
                      <button onClick={() => reviewItem('/api/vacations', v.id, 'APPROVED')} className="p-1 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"><Check size={13} /></button>
                      <button onClick={() => reviewItem('/api/vacations', v.id, 'REJECTED')} className="p-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"><X size={13} /></button>
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
          <form onSubmit={createDayOff} className="bg-slate-800/50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-white">Lançar Folga</p>
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
              <div key={d.id} className="flex items-center justify-between bg-slate-800/40 rounded-xl p-3">
                <div>
                  <p className="text-sm font-medium text-white">{d.user?.name}</p>
                  <p className="text-xs text-slate-400">{fmtDate(d.date)}{d.reason ? ` · ${d.reason}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(d.status)}
                  {d.status === 'PENDING' && (
                    <>
                      <button onClick={() => reviewItem('/api/day-offs', d.id, 'APPROVED')} className="p-1 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"><Check size={13} /></button>
                      <button onClick={() => reviewItem('/api/day-offs', d.id, 'REJECTED')} className="p-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"><X size={13} /></button>
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
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Wrench size={14} className="text-amber-400" /> Correção Direta de Ponto
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
                  <div key={e.id} className="flex items-center justify-between bg-slate-700/50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-300 w-28">
                        {e.type === 'ENTRADA' ? 'Entrada' : e.type === 'SAIDA_ALMOCO' ? 'Saída Almoço' : e.type === 'RETORNO_ALMOCO' ? 'Retorno Almoço' : 'Saída'}
                      </span>
                      {editingId === e.id ? (
                        <input
                          type="time" value={editingTime}
                          onChange={ev => setEditingTime(ev.target.value)}
                          className="bg-slate-800 border border-amber-500 rounded-lg px-2 py-1 text-white text-sm focus:outline-none w-24"
                        />
                      ) : (
                        <span className="text-emerald-400 font-mono font-bold text-sm">{brtTime(e.timestamp)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {editingId === e.id ? (
                        <>
                          <button onClick={() => saveEntryTime(e.id)}
                            className="p-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-white transition-colors">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => { setEditingId(e.id); setEditingTime(brtTime(e.timestamp)) }}
                          className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors">
                          <Pencil size={13} />
                        </button>
                      )}
                      <button onClick={() => deleteEntryDirect(e.id)}
                        className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                {corrEntries.length < 4 && (
                  <p className="text-xs text-slate-500 text-center pt-1">
                    Próximo ponto do funcionário: <span className="text-amber-400 font-medium">
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

          <hr className="border-slate-700/50" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Solicitações dos Funcionários</p>

          <div className="flex gap-2 flex-wrap">
            {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
              <button key={s} onClick={() => setAdjFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  adjFilter === s ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}>
                {s === 'PENDING' ? 'Pendentes' : s === 'APPROVED' ? 'Aprovados' : 'Rejeitados'}
              </button>
            ))}
          </div>
          {adjustments.map((a: any) => (
            <div key={a.id} className="bg-slate-800/40 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">{a.user?.name}</p>
                {statusBadge(a.status)}
              </div>
              <p className="text-xs text-slate-400">
                {fmtDate(a.date)} · {a.punchType} → {new Date(a.requestedTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-xs text-slate-300">{a.reason}</p>
              {a.status === 'PENDING' && (
                <div className="flex gap-2 pt-0.5">
                  <button onClick={() => reviewItem('/api/time-adjustments', a.id, 'APPROVED')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 transition-colors">
                    <Check size={12} /> Aprovar
                  </button>
                  <button onClick={() => reviewItem('/api/time-adjustments', a.id, 'REJECTED')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 transition-colors">
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
          <div className="space-y-2">
            {hourBank.map((hb: any) => (
              <div key={hb.userId} className="flex items-center justify-between bg-slate-800/40 rounded-xl p-3">
                <div>
                  <p className="text-sm font-medium text-white">{hb.name}</p>
                  <p className="text-xs text-slate-400">
                    {hb.workedDays} dias · {hb.totalWorkedHours}h trabalhadas · {hb.totalExpectedHours}h esperadas
                  </p>
                </div>
                <span className={`text-sm font-bold ${hb.balanceHours >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {hb.balanceLabel}
                </span>
              </div>
            ))}
            {hourBank.length === 0 && <p className="text-slate-500 text-sm text-center py-6">Nenhum dado para o período</p>}
          </div>
        </div>
      )}
    </div>
  )
}
