import { clsx } from 'clsx'

interface BadgeProps { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'; className?: string }

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      variant === 'default' && 'bg-slate-700 text-slate-300',
      variant === 'success' && 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
      variant === 'warning' && 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
      variant === 'danger'  && 'bg-red-500/15 text-red-400 border border-red-500/20',
      variant === 'info'    && 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
      className
    )}>
      {children}
    </span>
  )
}
