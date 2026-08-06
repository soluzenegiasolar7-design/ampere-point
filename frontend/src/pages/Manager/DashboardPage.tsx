import { useEffect, useState } from 'react'
import { Users, Clock, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { api } from '../../services/api'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { HourBankList } from '../../components/shared/HourBankList'

interface Employee { id: string; name: string; unit?: string }

interface Props {
  employees: Employee[]
  inField: number
  absentEmps: Employee[]
  onLunchEmps: Employee[]
  onNavigateRH: () => void
  onNavigateMapa: () => void
}

export default function DashboardPage({ employees, inField, absentEmps, onLunchEmps, onNavigateRH, onNavigateMapa }: Props) {
  const [loading, setLoading] = useState(true)
  const [hourBank, setHourBank] = useState<any[]>([])
  const [pendingCounts, setPendingCounts] = useState({ absences: 0, vacations: 0, dayOffs: 0, adjustments: 0 })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [hb, abs, vac, doff, adj] = await Promise.all([
          api.get('/api/hour-bank/team'),
          api.get('/api/absences?status=PENDING'),
          api.get('/api/vacations?status=PENDING'),
          api.get('/api/day-offs?status=PENDING'),
          api.get('/api/time-adjustments?status=PENDING'),
        ])
        if (cancelled) return
        setHourBank(hb.data)
        setPendingCounts({
          absences: abs.data.length,
          vacations: vac.data.length,
          dayOffs: doff.data.length,
          adjustments: adj.data.length,
        })
      } catch {} finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Spinner size="lg" className="text-orange-600" /></div>
  }

  const totalBalanceMinutes = hourBank.reduce((sum, hb) => sum + hb.balanceMinutes, 0)
  const totalBalanceHours = totalBalanceMinutes / 60
  const pendingTotal = pendingCounts.absences + pendingCounts.vacations + pendingCounts.dayOffs + pendingCounts.adjustments
  const expiring = hourBank.filter(hb => hb.expiringMinutes > 0)
  const expiringHours = expiring.reduce((sum, hb) => sum + hb.expiringHours, 0)

  const chartData = [...hourBank]
    .sort((a, b) => b.balanceHours - a.balanceHours)
    .map(hb => ({ name: hb.name.split(' ')[0], hours: hb.balanceHours }))

  const alerts: { label: string; onClick: () => void }[] = []
  if (pendingCounts.absences > 0) alerts.push({ label: `${pendingCounts.absences} solicitação(ões) de ausência pendente(s)`, onClick: onNavigateRH })
  if (pendingCounts.vacations > 0) alerts.push({ label: `${pendingCounts.vacations} solicitação(ões) de férias pendente(s)`, onClick: onNavigateRH })
  if (pendingCounts.dayOffs > 0) alerts.push({ label: `${pendingCounts.dayOffs} solicitação(ões) de folga pendente(s)`, onClick: onNavigateRH })
  if (pendingCounts.adjustments > 0) alerts.push({ label: `${pendingCounts.adjustments} ajuste(s) de ponto pendente(s)`, onClick: onNavigateRH })
  if (expiring.length > 0) alerts.push({ label: `${expiring.length} funcionário(s) com saldo de banco de horas vencendo (${expiringHours.toFixed(1)}h no total)`, onClick: onNavigateRH })
  if (absentEmps.length > 0) alerts.push({ label: `${absentEmps.length} funcionário(s) ausente(s) hoje`, onClick: onNavigateMapa })

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Users size={18} />}
          label="Colaboradores Ativos"
          value={employees.length}
          sub={`${inField} em campo · ${onLunchEmps.length} almoço · ${absentEmps.length} ausente${absentEmps.length !== 1 ? 's' : ''}`}
          variant="neutral"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Saldo Total do Banco de Horas"
          value={`${totalBalanceHours >= 0 ? '+' : ''}${totalBalanceHours.toFixed(1)}h`}
          sub="soma de todos os funcionários"
          variant={totalBalanceHours >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          icon={<AlertTriangle size={18} />}
          label="Pendências de Aprovação"
          value={pendingTotal}
          sub="ausências, férias, folgas e ajustes"
          variant={pendingTotal > 0 ? 'danger' : 'success'}
          badge={pendingTotal > 0 ? <Badge variant="danger">URGENTE</Badge> : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Saldo do Banco de Horas por Funcionário</p>
          {chartData.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-12">Sem dados no período</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} unit="h" />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: '#0f172a' }}
                  formatter={(v) => [`${Number(v).toFixed(2)}h`, 'Saldo']}
                />
                <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.hours > 0 ? '#059669' : d.hours < 0 ? '#dc2626' : '#cbd5e1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Alertas</p>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-500">
              <CheckCircle2 size={22} className="text-emerald-700" />
              <p className="text-xs">Nenhum alerta no momento</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <button key={i} onClick={a.onClick}
                  className="w-full text-left flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 hover:bg-red-100 transition-colors">
                  <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
                  <span className="text-xs text-red-700">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Clock size={13} /> Saldo do Banco de Horas
        </p>
        <HourBankList data={hourBank} compact />
      </div>
    </div>
  )
}
