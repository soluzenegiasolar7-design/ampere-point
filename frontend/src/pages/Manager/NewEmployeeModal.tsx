import { useState } from 'react'
import { X, UserPlus, AlertCircle } from 'lucide-react'
import { api } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

interface Props {
  onClose: () => void
  onCreated: () => void
}

const labelCls = 'text-xs font-medium text-slate-400 block mb-1.5'
const selectCls = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors'

export default function NewEmployeeModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'EMPLOYEE', unit: 'Natal', phone: '', cpf: '', pis: '', hireDate: '', contractHours: '8' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await api.post('/api/users', {
        name: form.name, email: form.email, password: form.password, role: form.role,
        unit: form.unit || undefined, phone: form.phone || undefined,
        cpf: form.cpf || undefined, pis: form.pis || undefined,
        hireDate: form.hireDate || undefined,
        contractHours: form.contractHours ? Number(form.contractHours) : undefined,
      })
      onCreated(); onClose()
    } catch (err: any) {
      const data = err.response?.data
      const msg = data?.error || data?.message || 'Erro ao cadastrar funcionário'
      const detail = data?.details?.[0]?.message
      setError(detail ? `${msg}: ${detail}` : msg)
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-sm" style={{ zIndex: 9999 }} onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><UserPlus size={18} className="text-amber-400" /> Novo Funcionário</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><X size={18} /></button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl p-3 mb-4">
            <AlertCircle size={15} className="shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <Input label="Nome completo *" placeholder="João Silva" value={form.name} onChange={e => set('name', e.target.value)} required />
          <Input label="E-mail *" type="email" placeholder="joao@ampere.com" value={form.email} onChange={e => set('email', e.target.value)} required />
          <Input label="Senha inicial *" type="password" placeholder="Mínimo 6 caracteres" minLength={6} value={form.password} onChange={e => set('password', e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Função</label><select value={form.role} onChange={e => set('role', e.target.value)} className={selectCls}><option value="EMPLOYEE">Vendedor</option><option value="MANAGER">Gestor</option><option value="ADMIN">Admin</option></select></div>
            <div><label className={labelCls}>Unidade</label><select value={form.unit} onChange={e => set('unit', e.target.value)} className={selectCls}><option value="Natal">Natal</option><option value="Caruaru">Caruaru</option></select></div>
          </div>
          <Input label="Telefone" placeholder="(84) 99999-9999" value={form.phone} onChange={e => set('phone', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="CPF" placeholder="000.000.000-00" value={form.cpf} onChange={e => set('cpf', e.target.value)} />
            <Input label="PIS" placeholder="000.00000.00-0" value={form.pis} onChange={e => set('pis', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data de contratação" type="date" value={form.hireDate} onChange={e => set('hireDate', e.target.value)} />
            <Input label="Horas/dia (contrato)" type="number" min="1" max="12" step="0.5" placeholder="8" value={form.contractHours} onChange={e => set('contractHours', e.target.value)} />
          </div>
          <div className="flex gap-3 mt-1">
            <Button type="button" variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
            <Button type="submit" fullWidth loading={loading}><UserPlus size={16} /> Cadastrar</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
