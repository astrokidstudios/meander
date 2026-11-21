import { useEffect, useState } from 'react'
import { Check, Copy, Crown, MessageCircle, Share2, UserPlus, X } from 'lucide-react'
import { Share } from '@capacitor/share'
import { Capacitor } from '@capacitor/core'
import Modal from './Modal'
import { AccountModal, Avatar } from './Account'
import { inviteLink, inviteUsername, isShared, pendingUsernameInvites, removeMember, shareTrip, tripMembers, useAccount, whatsappUrl, declineInvite, type Member } from '../cloud'
import type { Trip } from '../db'

export default function ShareTrip({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { user, profile } = useAccount()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [pending, setPending] = useState<{ code: string; username: string }[]>([])
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const reload = async () => {
    if (!isShared(trip.id)) { setMembers([]); return }
    const [m, p] = await Promise.all([tripMembers(trip.id), pendingUsernameInvites(trip.id)])
    setMembers(m)
    setPending(p)
  }
  useEffect(() => { if (user) reload() }, [user, trip.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <AccountModal onClose={onClose} reason="Sign in or create a free account to share this trip. Everyone you invite sees the same plan, and changes sync to all of you." />

  const message = async () => {
    const link = await inviteLink(trip.id)
    const who = profile?.display_name || (profile ? `@${profile.username}` : 'I')
    return { link, text: `${who} invited you to plan “${trip.name}” together on Meander. Join here: ${link}` }
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setErr(''); setMsg(''); setBusy(key)
    try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  const viaWhatsApp = () => run('wa', async () => {
    // Open the tab first (iOS blocks pop-ups opened after an await), then point it at WhatsApp.
    const win = Capacitor.isNativePlatform() ? null : window.open('', '_blank')
    const { text } = await message()
    if (win) win.location.href = whatsappUrl(text)
    else window.open(whatsappUrl(text), '_blank')
    reload()
  })

  const viaShare = () => run('share', async () => {
    const { text, link } = await message()
    if (Capacitor.isNativePlatform()) await Share.share({ title: `Join ${trip.name}`, text: text.replace(link, '').trim(), url: link, dialogTitle: 'Invite to trip' })
    else if (navigator.share) await navigator.share({ title: `Join ${trip.name}`, text })
    else { await navigator.clipboard.writeText(text); setMsg('Invite copied. Paste it into a message.') }
    reload()
  })

  const copy = () => run('copy', async () => {
    const { link } = await message()
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    reload()
  })

  const byUsername = () => run('user', async () => {
    if (!username.trim()) return
    const who = await inviteUsername(trip.id, username)
    setMsg(`Invited @${who.username}. They’ll see it next time they open Meander.`)
    setUsername('')
    reload()
  })

  const me = user.id
  const iOwn = members?.find((m) => m.user_id === me)?.owner ?? true

  return (
    <Modal title="Invite to this trip" onClose={onClose}>
      <p className="muted small">Everyone on the trip can see and edit the plan. Changes sync to all of you, and it all still works offline.</p>

      <div className="share-buttons">
        <button className="btn share-wa" disabled={!!busy} onClick={viaWhatsApp}><MessageCircle size={18} aria-hidden="true" /> WhatsApp</button>
        <button className="btn" disabled={!!busy} onClick={viaShare}><Share2 size={18} aria-hidden="true" /> Message or contact</button>
        <button className="btn" disabled={!!busy} onClick={copy}>{copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />} {copied ? 'Copied' : 'Copy link'}</button>
      </div>

      <form className="invite-user" onSubmit={(e) => { e.preventDefault(); byUsername() }}>
        <label className="field">Invite by username
          <div className="row gap">
            <div className="at-input grow"><span>@</span><input autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.@]/g, ''))} placeholder="username" /></div>
            <button className="btn primary" disabled={!!busy || !username.trim()}><UserPlus size={17} aria-hidden="true" /> Invite</button>
          </div>
        </label>
      </form>

      {msg && <div className="notice subtle">{msg}</div>}
      {err && <div className="form-error" role="alert">{err}</div>}

      {members && members.length > 0 && (
        <div className="member-list">
          <h3>On this trip</h3>
          {members.map((m) => (
            <div className="member" key={m.user_id}>
              <Avatar name={m.display_name || m.username} />
              <div className="grow">
                <div className="member-name">{m.display_name || m.username}{m.user_id === me && ' (you)'}</div>
                <div className="muted small">@{m.username}</div>
              </div>
              {m.owner && <span className="tag"><Crown size={12} aria-hidden="true" /> Organiser</span>}
              {iOwn && !m.owner && <button className="icon-btn sm" aria-label={`Remove ${m.username}`} onClick={async () => { if (confirm(`Remove @${m.username} from this trip?`)) { await removeMember(trip.id, m.user_id); reload() } }}><X size={16} /></button>}
            </div>
          ))}
          {pending.map((p) => (
            <div className="member pending" key={p.code}>
              <Avatar name={p.username} />
              <div className="grow"><div className="member-name">@{p.username}</div><div className="muted small">Invited, not joined yet</div></div>
              <button className="icon-btn sm" aria-label={`Cancel invite for ${p.username}`} onClick={async () => { await declineInvite(p.code); reload() }}><X size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {members && members.length === 0 && !isShared(trip.id) && (
        <button className="btn ghost small" disabled={!!busy} onClick={() => run('share', async () => { await shareTrip(trip.id); reload() })}>Just put it online for now</button>
      )}
    </Modal>
  )
}
