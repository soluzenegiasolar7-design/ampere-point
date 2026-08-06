import { clsx } from 'clsx'

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  variant?: 'neutral' | 'success' | 'danger'
  badge?: React.ReactNode
  className?: string
}

const VARIANT_STYLES = {
  neutral: { card: 'from-blue-50 to-white border-blue-200', icon: 'bg-blue-100 text-blue-600' },
  success: { card: 'from-emerald-50 to-white border-emerald-200', icon: 'bg-emerald-100 text-emerald-600' },
  danger: { card: 'from-red-50 to-white border-red-200', icon: 'bg-red-100 text-red-600' },
}

export function StatCard({ icon, label, value, sub, variant = 'neutral', badge, className }: StatCardProps) {
  const styles = VARIANT_STYLES[variant]
  return (
    <div className={clsx(
      'relative bg-gradient-to-br rounded-2xl border p-4 overflow-hidden',
      styles.card,
      className
    )}>
      <div className="flex items-start justify-between">
        <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center', styles.icon)}>
          {icon}
        </div>
        {badge}
      </div>
      <p className="text-xs text-slate-500 mt-3">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}
