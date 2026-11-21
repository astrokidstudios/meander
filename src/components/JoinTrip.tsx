import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Smartphone, Users } from 'lucide-react'
import Logo from './Logo'
import { AccountModal } from './Account'
import { acceptInvite, previewInvite, useAccount } from '../cloud'
import { go } from '../App'

type Preview = Awaited<ReturnType<typeof previewInvite>>

/** Opened from an invite link: #/join/<code> */
export default function JoinTrip({ code }: { code: string }) {
  const { user } = useAccount()
  const [preview, setPreview] = useState<Preview | undefined>(undefined)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [auth, setAuth] = useState(false)

  useEffect(() => {
    if (!user) return
    previewInvite(code).then(setPreview).catch((e) => setErr((e as Error).message))
  }, [user, code])

  const join = async () => {
    setBusy(true)
    setErr('')
    try {
      const id = await acceptInvite(code)
      go(`/trip/${id}/plan`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="join-page">
      <div className="join-card">
        <Logo size={52} />
        <div className="join-icon"><Users size={30} aria-hidden="true" /></div>
        {!user && <>
          <h1>You’re invited to a trip</h1>
          <p className="muted">Sign in or make a free Meander account to see the plan and join in.</p>
          <button className="btn primary lg" onClick={() => setAuth(true)}>Continue</button>
        </>}
        {user && preview === undefined && !err && <p className="muted">Opening your invite…</p>}
        {user && preview === null && <>
          <h1>This invite has expired</h1>
          <p className="muted">Ask for a fresh link. Invites last 30 days.</p>
        </>}
        {user && preview && <>
          <h1>{preview.title || 'A trip'}</h1>
          <p className="muted">{preview.inviter_name || `@${preview.inviter}`} invited you to plan this trip together. You’ll both see and edit the same plan.</p>
          {preview.already_member
            ? <button className="btn primary lg" onClick={join}>Open the trip</button>
            : <button className="btn primary lg" disabled={busy} onClick={join}>{busy ? 'Joining…' : 'Join trip'}</button>}
        </>}
        {err && <div className="form-error" role="alert">{err}</div>}
        {!Capacitor.isNativePlatform() && (
          <a className="btn ghost small open-app" href={`meander://join/${code}`}><Smartphone size={15} aria-hidden="true" /> Have the app? Open it there</a>
        )}
        <button className="btn ghost small" onClick={() => go('/')}>Not now</button>
      </div>
      {auth && <AccountModal onClose={() => setAuth(false)} reason="Make a free account (or sign in) to join. The same account works in Trailz." />}
    </div>
  )
}
