import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Mail, Lock, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      const role = useAuthStore.getState().user?.role
      navigate(role === 'EMPLOYEE' ? '/ponto' : '/gestor', { replace: true })
    } catch {
      setError('E-mail ou senha incorretos. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-600 rounded-2xl mb-4 shadow-2xl shadow-orange-500/30">
            <Zap size={32} className="text-white fill-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">AmperePoint</h1>
          <p className="text-slate-500 text-sm mt-1">Sistema de Ponto Eletrônico</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl">
          <h2 className="text-base font-semibold text-slate-900 mb-5">Entrar na sua conta</h2>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3 mb-5">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              leftIcon={<Mail size={16} />}
              autoComplete="email"
              required
            />
            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              leftIcon={<Lock size={16} />}
              autoComplete="current-password"
              required
            />
            <Button type="submit" fullWidth size="lg" loading={loading} className="mt-2">
              {!loading && <Zap size={18} className="fill-current" />}
              Entrar
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Ampere Soluções em Energia Solar © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
