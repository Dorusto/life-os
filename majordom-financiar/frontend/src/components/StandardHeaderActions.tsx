import AddButton from './AddButton'

/**
 * Header-right cluster for Dashboard/Accounts/Transactions/Analytics.
 *
 * The Notifications bell and the Settings button now live in the shared shell
 * (`components/shell/AppShell`) — rail on desktop, mobile top-right + More
 * sheet — so rendering them here would duplicate them in every page header.
 * Add is the one action that is genuinely page-scoped, so this cluster is
 * Add-only now: 'full' renders Add, and 'no-add' / 'bell-only' render nothing.
 * The variant type and prop stay so existing callers (review/detail pages,
 * Settings) keep compiling unchanged.
 */
export type StandardHeaderActionsVariant = 'full' | 'no-add' | 'bell-only'

interface StandardHeaderActionsProps {
  variant?: StandardHeaderActionsVariant
}

export default function StandardHeaderActions({ variant = 'full' }: StandardHeaderActionsProps) {
  if (variant !== 'full') return null
  return <AddButton />
}
