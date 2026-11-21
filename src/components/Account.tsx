import { useState } from 'react'
import { LogOut, UserRound } from 'lucide-react'
import Modal from './Modal'
import { signIn, signOut, signUp, updateDisplayName, useAccount } from '../cloud'

export function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">{initials(name)}</span>
}

/** The button on the home screen: your avatar when signed in, "Sign in" when not. */
export function AccountButton() {
  const { profile, user } = useAccount()
  const [open, setOpen] = useState(false)
  return (
    <>
      {user ? (
        <button className="account-btn" onClick={() => setOpen(true)} aria-label="Your account" title={profile ? `@${profile.username}` : 'Your account'}>
          <Avatar name={profile?.display_name || profile?.username || '?'} />
        </button>
      ) : (
        <button className="btn ghost small" onClick={() => setOpen(true)}><UserRound size={15} aria-hidden="true" /> Sign in</button>
      )}
      {open && <AccountModal onClose={() => setOpen(false)} />}
    </>
  )
}

export function AccountModal({ onClose, reason }: { onClose: () => void; reason?: string }) {
  const { profile, user } = useAccount()
  if (user) return <ProfileModal onClose={onClose} />
  return <AuthModal onClose={onClose} reason={reason} hasProfile={!!profile} />
}

function AuthModal({ onClose, reason }: { onClose: () => void; reason?: string; hasProfile: boolean }) {
  const [mode, setMode] = useState<'up' | 'in'>('up')
  const [f, setF] = useState({ name: '', username: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    setErr('')
    setBusy(true)
    try {
      if (mode === 'up') {
        if (!f.name.trim()) throw new Error('Add your name so family know it’s you.')
        const { needsConfirm } = await signUp(f.email, f.password, f.username, f.name)
        if (needsConfirm) { setSent(true); return }
      } else {
        await signIn(f.email, f.password)
      }
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Modal title="Check your email" onClose={onClose} footer={<button className="btn primary" onClick={() => { setSent(false); setMode('in') }}>I’ve confirmed it</button>}>
        <p>We sent a confirm link to <b>{f.email}</b>. Tap it, then come back and sign in.</p>
      </Modal>
    )
  }

  return (
    <Modal
      title={mode === 'up' ? 'Create your account' : 'Sign in'}
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setErr('') }}>{mode === 'up' ? 'I have an account' : 'New here? Sign up'}</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'One sec…' : mode === 'up' ? 'Create account' : 'Sign in'}</button>
      </>}
    >
      <form className="form auth-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <p className="muted small">{reason ?? 'An account lets you share trips with family and friends. The same account works in Trailz.'}</p>
        {mode === 'up' && <>
          <label>Your name<input autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Josh" /></label>
          <label>Username<div className="at-input"><span>@</span><input autoCapitalize="none" autoCorrect="off" value={f.username} onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))} placeholder="josh" maxLength={20} /></div></label>
        </>}
        <label>Email<input type="email" autoComplete="email" autoCapitalize="none" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={f.password} onChange={(e) => set('password', e.target.value)} placeholder={mode === 'up' ? 'At least 6 characters' : ''} /></label>
        {err && <div className="form-error" role="alert">{err}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  const { profile, user } = useAccount()
  const [name, setName] = useState(profile?.display_name ?? '')
  return (
    <Modal
      title="Your account"
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={async () => { await signOut(); onClose() }}><LogOut size={15} aria-hidden="true" /> Sign out</button>
        <button className="btn primary" onClick={async () => { if (name !== profile?.display_name) await updateDisplayName(name); onClose() }}>Done</button>
      </>}
    >
      <div className="profile-head">
        <Avatar name={name || profile?.username || '?'} size={56} />
        <div>
          <div className="profile-user">@{profile?.username ?? '…'}</div>
          <div className="muted small">{user?.email}</div>
        </div>
      </div>
      <form className="form" onSubmit={(e) => e.preventDefault()}>
        <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <p className="muted small">Family can invite you to their trips with your username, <b>@{profile?.username}</b>. Your trips stay on this device, and shared ones also sync to everyone on them.</p>
      </form>
    </Modal>
  )
}
