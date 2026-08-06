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
    const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white active:scale-[0.98]'
    const variants = {
      primary:   'bg-orange-600 text-white hover:bg-orange-700 focus:ring-orange-500 shadow-lg shadow-orange-500/20',
      secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 focus:ring-slate-400',
      ghost:     'text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-300',
      danger:    'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 focus:ring-red-500',
      success:   'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 shadow-lg shadow-emerald-500/20',
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
