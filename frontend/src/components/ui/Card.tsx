import { clsx } from 'clsx'

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-white border border-slate-200 rounded-2xl', className)}>
      {children}
    </div>
  )
}
