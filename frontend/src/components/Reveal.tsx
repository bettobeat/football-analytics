import { setGuessFirst } from '../lib/reveal'

const Eye = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

// buttons can sit inside a card that is itself a link: keep the click from opening the match
const stop = (fn: () => void) => (e: { preventDefault(): void; stopPropagation(): void }) => {
  e.preventDefault()
  e.stopPropagation()
  fn()
}

/** Big cover for the match page: the prediction stays hidden until the member taps Reveal. */
export function RevealCover({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-accent/40 bg-accent/[0.06] p-6 sm:p-8 text-center flex flex-col items-center gap-3">
      <div className="font-display text-lg font-bold text-ink">What's your call?</div>
      <p className="text-sm text-muted max-w-sm">Make your own guess first, then see what v3 thinks — the percentages, why this pick, and the full breakdown.</p>
      <button type="button" onClick={stop(onReveal)} className="mt-1 h-12 px-6 inline-flex items-center gap-2 rounded-2xl bg-accent text-bg font-extrabold hover:brightness-105">
        <Eye /> Reveal prediction
      </button>
      <button type="button" onClick={stop(() => setGuessFirst(false))} className="text-xs text-faint hover:text-ink underline underline-offset-4">
        Always show predictions
      </button>
    </div>
  )
}

/** Small version for match cards and the home page. `dark` = on the always-dark featured hero. */
export function RevealChip({ onReveal, dark = false }: { onReveal: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={stop(onReveal)}
      className={`w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${
        dark ? 'bg-white/10 text-[#C8FF3D] border border-white/15 hover:bg-white/15' : 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/15'
      }`}
    >
      <Eye size={16} /> Reveal prediction
    </button>
  )
}
