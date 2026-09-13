import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/ui'

const CONTROL =
  'w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink ' +
  'placeholder:text-ink-3 focus:border-brand-2 focus:outline-none focus:ring-2 focus:ring-brand-soft'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-loss">{error}</p>
      ) : (
        hint && <p className="text-[12px] text-ink-3">{hint}</p>
      )}
    </div>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, 'tnum', className)} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(CONTROL, 'appearance-none pr-8', className)}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CONTROL, 'min-h-[80px] resize-y', className)} />
}
