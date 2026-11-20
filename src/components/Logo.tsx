/** Meander mark: a winding river path between two waypoints. */
export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <rect width="64" height="64" rx="16" fill="var(--brand)" />
      <path
        d="M14 48c10 0 10-10 18-10s8-12 18-12"
        fill="none"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="14" cy="48" r="5" fill="var(--accent)" stroke="#fff" strokeWidth="2.5" />
      <circle cx="50" cy="20" r="6" fill="var(--sun)" stroke="#fff" strokeWidth="2.5" />
    </svg>
  )
}
