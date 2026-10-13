import type { ReactNode } from 'react'
import { useStuck, stuckBg } from '../lib/useStuck'

/** Sticky bar under the site header: transparent at rest, frosted only while pinned (no dark band over the page). */
export default function StickyBar({ className = '', children }: { className?: string; children: ReactNode }) {
  const [ref, stuck] = useStuck<HTMLDivElement>()
  return <div ref={ref} className={`sticky z-30 ${className} ${stuckBg(stuck)}`}>{children}</div>
}
