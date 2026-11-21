import { useState } from 'react'
import { Users } from 'lucide-react'
import { acceptInvite, declineInvite, useMyInvites } from '../cloud'
import { go } from '../App'

/** Trips people have invited me to by username. Shown on the home screen. */
export default function Invites() {
  const list = useMyInvites()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  if (!list.length) return null
  return (
    <div className="invites">
      {list.map((i) => (
        <div className="invite-card pop" key={i.code}>
          <span className="invite-icon"><Users size={20} aria-hidden="true" /></span>
          <div className="grow">
            <div className="invite-title">{i.title}</div>
            <div className="muted small">{i.from_name || `@${i.from}`} invited you to plan it together</div>
          </div>
          <button className="btn ghost small" disabled={!!busy} onClick={() => declineInvite(i.code)}>No thanks</button>
          <button className="btn primary small" disabled={!!busy} onClick={async () => {
            setBusy(i.code); setErr('')
            try { const id = await acceptInvite(i.code); go(`/trip/${id}/plan`) } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
          }}>{busy === i.code ? 'Joining…' : 'Join'}</button>
        </div>
      ))}
      {err && <div className="form-error">{err}</div>}
    </div>
  )
}
