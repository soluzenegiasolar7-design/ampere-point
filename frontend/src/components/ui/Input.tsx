import { forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; leftIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, label, error, leftIcon, id, ...props }, ref) => {
  const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={inputId} className="text-sm font-medium text-slate-400">{label}</label>}
      <div className="relative">
        {leftIcon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{leftIcon}</span>}
        <input ref={ref} id={inputId}
          className={clsx(
            'w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm',
            'focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors',
            leftIcon && 'pl-10',
            error && 'border-red-500',
            className
          )} {...props} />
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
})
Input.displayName = 'Input'
