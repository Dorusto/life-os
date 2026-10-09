// GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/kit/Field.tsx.
// Run python3 scripts/sync_shared_frontend.py after editing the source, then commit both.

import { forwardRef } from 'react'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cx } from '../shell/cx'

/**
 * One look for every form field: paper fill, hairline border, a radius one step below the Card's
 * so the field reads as sitting inside it, brand border on focus.
 */
export const FIELD_CLASSES =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors ' +
  'placeholder:text-ink-3 focus:border-brand disabled:cursor-not-allowed disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} {...props} className={cx(FIELD_CLASSES, className)} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} {...props} className={cx(FIELD_CLASSES, className)} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} {...props} className={cx(FIELD_CLASSES, className)} />
  },
)
