import React from 'react'

const getAccentClasses = (accent) => {
  switch (accent) {
    case 'blue':
      return 'from-blue-500/30 to-blue-500/5 text-blue-100'
    case 'emerald':
      return 'from-emerald-500/25 to-emerald-500/5 text-emerald-100'
    case 'violet':
      return 'from-violet-500/25 to-violet-500/5 text-violet-100'
    case 'amber':
      return 'from-amber-500/25 to-amber-500/5 text-amber-100'
    default:
      return 'from-slate-700/40 to-slate-800/20 text-slate-200'
  }
}

const StatCard = ({ label, value, helper, badge, accent }) => {
  const accentClasses = getAccentClasses(accent)

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-5 transition hover:border-white/20 hover:bg-slate-900/80">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accentClasses} opacity-0 transition-opacity group-hover:opacity-70`}
      />
      <div className="relative space-y-3">
        <header className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">{label}</p>
          {badge ? (
            <span className="rounded-full bg-white/5 px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-white/70">
              {badge}
            </span>
          ) : null}
        </header>
        <div className="text-2xl font-semibold text-white">{value}</div>
        {helper ? <p className="text-sm text-slate-400">{helper}</p> : null}
      </div>
    </article>
  )
}

export default StatCard
