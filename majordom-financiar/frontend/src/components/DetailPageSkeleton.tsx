/**
 * Full-page skeleton for a detail screen's initial load (Vehicle Detail,
 * Account Detail) — replaces a blank `<div className="min-h-dvh" />` while
 * the header query is still pending. Both pages share the same
 * back-button/label/title/value header shape, so one generic skeleton
 * covers both rather than a copy per page. See
 * docs/glm-5.3/ui-audit-2026-08-30.md §2.4 — the audit's own worst-offender
 * example ("black screen 1-3s").
 */
export default function DetailPageSkeleton() {
  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-y-auto animate-pulse">
      <header className="flex-shrink-0 px-5 pb-3 pt-14">
        <div className="bg-surface-2 rounded mb-3 h-4 w-20" />
        <div className="bg-surface-2 rounded mb-2 h-3 w-16" />
        <div className="bg-surface-2 rounded mb-1.5 h-8 w-40" />
        <div className="bg-surface-2 rounded h-8 w-32" />
      </header>
      <section className="px-5 pt-2 pb-24 space-y-3">
        <div className="bg-surface-2 rounded-full h-9 w-48" />
        <div className="bg-surface rounded-2xl h-32" />
        <div className="bg-surface rounded-2xl h-20" />
        <div className="bg-surface rounded-2xl h-20" />
      </section>
    </div>
  )
}
