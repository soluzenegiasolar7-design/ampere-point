import { clsx } from 'clsx'

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-slate-900/80 border border-slate-800 rounded-2xl', className)}>
      {children}
    </div>
  )
}
