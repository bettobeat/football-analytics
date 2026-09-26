import { useEffect, useRef, useState } from 'react'

const reduced = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/**
 * A number that "rolls" to its value: a short scramble (like a slot machine), then it eases in to the real
 * figure. Only animates when `animate` is true (the moment a prediction is revealed); otherwise it just shows it.
 */
export default function CountUp({ value, decimals = 0, suffix = '', animate, delay = 0, className }: {
  value: number; decimals?: number; suffix?: string; animate: boolean; delay?: number; className?: string
}) {
  const [shown, setShown] = useState(animate ? 0 : value)
  const raf = useRef(0)
  useEffect(() => {
    if (!animate) { setShown(value); return }
    // devices set to "reduce motion" (Windows: animation effects off) get a calm count-up: no scramble, no overshoot
    const calm = reduced()
    const SCRAMBLE = calm ? 0 : 550, SETTLE = calm ? 700 : 950
    const t0 = performance.now() + delay
    let last = 0
    const tick = (now: number) => {
      const t = now - t0
      if (t < 0) { raf.current = requestAnimationFrame(tick); return }
      if (t < SCRAMBLE) {
        // scramble: jump around every ~55 ms
        if (now - last > 55) { last = now; setShown(8 + Math.random() * 64) }
      } else if (t < SCRAMBLE + SETTLE) {
        const x = (t - SCRAMBLE) / SETTLE
        const ease = 1 - Math.pow(1 - x, 4)
        // overshoot slightly past the value, then land on it
        const from = calm ? 0 : value < 50 ? value + 18 : value - 18
        setShown(from + (value - from) * ease + (calm ? 0 : Math.sin(x * Math.PI) * (value < 50 ? -2.5 : 2.5) * (1 - x)))
      } else {
        setShown(value)
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, animate, delay])
  return <span className={className}>{Math.max(0, shown).toFixed(decimals)}{suffix}</span>
}
