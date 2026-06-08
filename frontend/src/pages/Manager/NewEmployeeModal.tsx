import { useState } from 'react'
import { api } from '../../services/api'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function NewEmployeeModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    role: 'EMPLOYEE', unit: 'Natal',
    phone: '', cpf: '', pis: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/users', {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        unit: form.unit || undefined,
        phone: form.phone || undefined,
        cpf: form.cpf || undefined,
        pis: form.pis || undefined,
      })
      onCreated()
      onClose()
    } catch (err: any) {
      const data = err.response?.data
      const msg = data?.error || data?.message || 'Erro ao cadastrar funcionário'
      const detail = data?.details?.[0]?.message
      setError(detail ? `${msg}: ${detail}` : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70" style={{zIndex:9999}} onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-white">Novo Funcionário</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {/* Nome */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nome completo *</label>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ex: João Silva"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">E-mail *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="Ex: joao@ampere.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Senha */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Senha inicial *</label>
            <input
              required
              type="password"
              minLength={6}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Função + Unidade */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Função</label>
              <select
                value={form.role}
                onChange={e => set('role', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              >
                <option value="EMPLOYEE">Vendedor</option>
                <option value="MANAGER">Gestor</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Unidade</label>
              <select
                value={form.unit}
                onChange={e => set('unit', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              >
                <option value="Natal">Natal</option>
                <option value="Caruaru">Caruaru</option>
              </select>
            </div>
          </div>

          {/* Telefone */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Telefone</label>
            <input
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="Ex: (84) 99999-9999"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
          </div>

          {/* CPF + PIS */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">CPF</label>
              <input
                value={form.cpf}
                onChange={e => set('cpf', e.target.value)}
                placeholder="000.000.000-00"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">PIS</label>
              <input
                value={form.pis}
                onChange={e => set('pis', e.target.value)}
                placeholder="000.00000.00-0"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Cadastrando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
