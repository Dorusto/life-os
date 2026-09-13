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
      className={`sticky top-0 bg-token-paper backdrop-blur flex-shrink-0 flex items-center justify-between px-5 pb-3 pt-14 z-40 ${bordered ? 'border-b border-token-line' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-xs tracking-widest uppercase text-token-ink-3 truncate">{label}</p>
        <h1 className="font-plex-sans text-3xl font-bold text-token-ink capitalize truncate">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-1 flex-shrink-0 ml-2">{actions}</div>}
    </header>
  )
}
