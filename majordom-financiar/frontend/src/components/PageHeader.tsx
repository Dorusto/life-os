import type { ReactNode } from 'react'

interface PageHeaderProps {
  label: string
  title: string
  actions?: ReactNode
  /** Chat/Import have scrolling content right below the header, so a hairline
      separator earns its keep there; Home doesn't, so it stays off by default. */
  bordered?: boolean
}

/** Shared page header — label + title on the left, icon-button actions on the right. Same shell everywhere so a new page can't quietly drift on icon size, hover style, or padding. */
export default function PageHeader({ label, title, actions, bordered = false }: PageHeaderProps) {
  return (
    <header
      className={`flex-shrink-0 flex items-center justify-between px-5 pb-3 pt-14 ${bordered ? 'border-b border-border' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-xs tracking-widest uppercase text-muted truncate">{label}</p>
        <h1 className="font-display text-3xl font-bold text-white capitalize truncate">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-1 flex-shrink-0 ml-2">{actions}</div>}
    </header>
  )
}
