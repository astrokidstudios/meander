import { useEffect, useState } from 'react'
import { PartyPopper } from 'lucide-react'

const COLORS = ['#ff6b4a', '#ffc93c', '#2ec4b6', '#7b61ff', '#4cc9f0', '#ff8fab']

/** Fire a little celebration from anywhere. */
export function celebrate(message: string) {
  window.dispatchEvent(new CustomEvent('meander:celebrate', { detail: message }))
}

export default function Confetti() {
  const [burst, setBurst] = useState<{ id: number; message: string } | null>(null)
  useEffect(() => {
    let timer: number | undefined
    const on = (e: Event) => {
      setBurst({ id: Date.now(), message: (e as CustomEvent<string>).detail })
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setBurst(null), 2600)
    }
    window.addEventListener('meander:celebrate', on)
    return () => { window.removeEventListener('meander:celebrate', on); window.clearTimeout(timer) }
  }, [])
  if (!burst) return null
  return (
    <div className="confetti" key={burst.id} aria-live="polite">
      {Array.from({ length: 36 }, (_, i) => {
        const round = i % 3 === 0
        const style = {
          left: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 0.4}s`,
          animationDuration: `${1.6 + Math.random() * 1}s`,
          '--drift': `${(Math.random() - 0.5) * 160}px`,
          '--spin': `${(Math.random() - 0.5) * 720}deg`,
          background: COLORS[i % COLORS.length],
        } as React.CSSProperties
        return <span key={i} className={round ? 'bit round' : 'bit'} style={style} />
      })}
      <div className="confetti-toast"><PartyPopper size={18} aria-hidden="true" /> {burst.message}</div>
    </div>
  )
}
