import { forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; leftIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, label, error, leftIcon, id, ...props }, ref) => {
  const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={inputId} className="text-sm font-medium text-slate-600">{label}</label>}
      <div className="relative">
        {leftIcon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{leftIcon}</span>}
        <input ref={ref} id={inputId}
          className={clsx(
            'w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 text-sm',
            'focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 transition-colors',
            leftIcon && 'pl-10',
            error && 'border-red-400',
            className
          )} {...props} />
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
})
Input.displayName = 'Input'
