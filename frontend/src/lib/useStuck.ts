import { useEffect, useRef, useState } from 'react'

/**
 * True while a `position: sticky` element is pinned to its `top` offset.
 * Sticky bars use it to paint a background only while rows scroll under them:
 * a bar that is resting in the page stays fully transparent (no dark band over the page gradient).
 */
export function useStuck<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const check = () => {
      raf = 0
      const top = parseFloat(getComputedStyle(el).top) || 0
      const r = el.getBoundingClientRect()
      // pinned = sitting exactly at its sticky offset while the page has scrolled past its natural place
      const pinned = Math.abs(r.top - top) < 1.5 && window.scrollY > 0 && (el.previousElementSibling ? el.previousElementSibling.getBoundingClientRect().bottom < top : true)
      setStuck(s => (s === pinned ? s : pinned))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check) }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return [ref, stuck] as const
}

/** Background for a sticky bar: nothing at rest, frosted only while pinned. */
export const stuckBg = (stuck: boolean) =>
  `transition-[background-color,backdrop-filter] duration-200 ${stuck ? 'bg-bg/85 backdrop-blur-xl' : 'bg-transparent'}`
