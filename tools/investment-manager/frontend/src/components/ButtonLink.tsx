import { Link, type LinkProps } from 'react-router-dom'
import { BUTTON_BASE, SIZE_CLASSES, VARIANT_CLASSES, type Size, type Variant } from './Button'
import { cn } from '../lib/ui'

interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: Variant
  size?: Size
  className?: string
}

/**
 * A router `Link` wearing `Button` styling, for the page action that navigates
 * instead of submitting. The class maps come from `Button`, so the two cannot
 * drift apart.
 */
export function ButtonLink({ variant = 'secondary', size = 'md', className, ...props }: ButtonLinkProps) {
  return (
    <Link {...props} className={cn(BUTTON_BASE, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)} />
  )
}
