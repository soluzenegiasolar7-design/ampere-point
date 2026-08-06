import { clsx } from 'clsx'

interface BadgeProps { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'; className?: string }

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      variant === 'default' && 'bg-slate-100 text-slate-600',
      variant === 'success' && 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      variant === 'warning' && 'bg-orange-50 text-orange-700 border border-orange-200',
      variant === 'danger'  && 'bg-red-50 text-red-700 border border-red-200',
      variant === 'info'    && 'bg-blue-50 text-blue-700 border border-blue-200',
      className
    )}>
      {children}
    </span>
  )
}
