import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { api } from '../../services/api'
import { Spinner } from '../ui/Spinner'

interface HourBankItem {
  userId: string
  name: string
  balanceHours: number
  workedDays?: number
  totalWorkedHours?: number
  totalExpectedHours?: number
  expiringMinutes?: number
  expiringHours?: number
  windowMonths?: number
}

interface HourBankEntry {
  id: string
  type: string
  minutes: number
  date: string
  reason?: string
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR')
}

function entryTypeLabel(type: string) {
  if (type === 'DAYOFF_DEBIT') return 'Folga aprovada'
  if (type === 'MANUAL_CREDIT') return 'Ajuste manual (crédito)'
  if (type === 'MANUAL_DEBIT') return 'Ajuste manual (débito)'
  return type
}

function sortHourBank(data: HourBankItem[]) {
  return [...data].sort((a, b) => {
    if (a.balanceHours > 0 && b.balanceHours > 0) return b.balanceHours - a.balanceHours
    if (a.balanceHours < 0 && b.balanceHours < 0) return a.balanceHours - b.balanceHours
    if (a.balanceHours === 0 && b.balanceHours === 0) return 0
    if (a.balanceHours === 0) return 1
    if (b.balanceHours === 0) return -1
    return b.balanceHours - a.balanceHours
  })
}

function balanceClass(hours: number) {
  return hours > 0 ? 'text-emerald-600' : hours < 0 ? 'text-red-600' : 'text-slate-400'
}

function balanceLabel(hours: number) {
  return hours === 0 ? '0' : `${hours.toFixed(2)}h`
}

export function HourBankList({ data, compact = false }: { data: HourBankItem[]; compact?: boolean }) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [entries, setEntries] = useState<HourBankEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)

  async function toggleEntries(userId: string) {
    if (expandedUserId === userId) { setExpandedUserId(null); return }
    setExpandedUserId(userId)
    setEntriesLoading(true)
    try {
      const r = await api.get(`/api/hour-bank/entries?userId=${userId}`)
      setEntries(r.data)
    } catch {} finally { setEntriesLoading(false) }
  }

  async function removeEntry(id: string) {
    if (!window.confirm('Remover este ajuste manual?')) return
    try {
      await api.delete(`/api/hour-bank/entries/${id}`)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {}
  }

  const sorted = sortHourBank(data)

  return (
    <div className="space-y-1">
      {sorted.map(hb => (
        <div key={hb.userId} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
          {compact ? (
            <div className="w-full flex items-center justify-between px-3 py-2">
              <span className="text-xs font-semibold uppercase text-slate-700 tracking-wide">{hb.name}</span>
              <span className={`text-sm font-bold tabular-nums ${balanceClass(hb.balanceHours)}`}>
                {balanceLabel(hb.balanceHours)}
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => toggleEntries(hb.userId)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-100 transition-colors">
              <span className="text-xs font-semibold uppercase text-slate-700 tracking-wide">{hb.name}</span>
              <span className={`text-sm font-bold tabular-nums ${balanceClass(hb.balanceHours)}`}>
                {balanceLabel(hb.balanceHours)}
              </span>
            </button>
          )}
          {!compact && expandedUserId === hb.userId && (
            <div className="border-t border-slate-200 p-3 space-y-2">
              <p className="text-xs text-slate-500">
                {hb.workedDays} dias · {hb.totalWorkedHours}h trabalhadas · {hb.totalExpectedHours}h esperadas
              </p>
              {!!hb.expiringMinutes && hb.expiringMinutes > 0 && (
                <p className="text-xs text-orange-600">
                  ⚠ {hb.expiringHours}h com mais de {hb.windowMonths} meses sem compensar
                </p>
              )}
              {entriesLoading && <div className="flex justify-center py-4"><Spinner /></div>}
              {!entriesLoading && entries.map(entry => (
                <div key={entry.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs text-slate-600">{entryTypeLabel(entry.type)}</p>
                    <p className="text-xs text-slate-500">{fmtDate(entry.date)}{entry.reason ? ` · ${entry.reason}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${entry.minutes >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {entry.minutes >= 0 ? '+' : ''}{(entry.minutes / 60).toFixed(1)}h
                    </span>
                    {entry.type !== 'DAYOFF_DEBIT' && (
                      <button onClick={() => removeEntry(entry.id)}
                        className="p-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!entriesLoading && entries.length === 0 && (
                <p className="text-slate-500 text-xs text-center py-3">Nenhum lançamento no extrato</p>
              )}
            </div>
          )}
        </div>
      ))}
      {sorted.length === 0 && <p className="text-slate-500 text-sm text-center py-6">Nenhum dado para o período</p>}
    </div>
  )
}
