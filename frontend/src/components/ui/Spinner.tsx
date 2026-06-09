import { clsx } from 'clsx'

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <div className={clsx('animate-spin rounded-full border-2 border-current border-t-transparent',
      size === 'sm' && 'w-4 h-4', size === 'md' && 'w-6 h-6', size === 'lg' && 'w-8 h-8', className)} />
  )
}
