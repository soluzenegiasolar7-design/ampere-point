import { forwardRef } from 'react'
import { clsx } from 'clsx'
import { Spinner } from './Spinner'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, fullWidth, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950 active:scale-[0.98]'
    const variants = {
      primary:   'bg-amber-500 text-gray-950 hover:bg-amber-400 focus:ring-amber-500 shadow-lg shadow-amber-500/20',
      secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 focus:ring-slate-500',
      ghost:     'text-slate-400 hover:bg-slate-800 hover:text-white focus:ring-slate-600',
      danger:    'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 focus:ring-red-500',
      success:   'bg-emerald-500 text-white hover:bg-emerald-400 focus:ring-emerald-500 shadow-lg shadow-emerald-500/20',
    }
    const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3.5 text-base' }
    return (
      <button ref={ref} className={clsx(base, variants[variant], sizes[size], fullWidth && 'w-full', className)} disabled={disabled || loading} {...props}>
        {loading ? <Spinner size="sm" /> : null}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
