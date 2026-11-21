/**
 * Accounts and shared trips. One Supabase project is shared with Trailz, so one login works in both apps.
 * Trips stay local-first in Dexie. A shared trip also syncs each record (trip, stop, day, expense, check)
 * to the cloud, last write wins per record. Offline edits queue up and send when back online.
 */
import { createClient, type Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { db, type CheckItem, type DayMeta, type Expense, type Stop, type Trip } from './db'

const SUPABASE_URL = 'https://solcjhgfwgwwodziwnvl.supabase.co'
const SUPABASE_KEY = 'sb_publishable_ev-20oQthnlsWGIq_pMtDQ_u75dF4E4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'meander.auth' },
})

export const WEB_URL = 'https://astrokidstudios.github.io/meander/'

export interface Profile { id: string; username: string; display_name: string }

// ---------- Session + profile ----------

let session: Session | null = null
let profile: Profile | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

async function loadProfile() {
  if (!session) { profile = null; return }
  const { data } = await supabase.from('profiles').select('id, username, display_name').eq('id', session.user.id).maybeSingle()
  profile = data ?? null
}

supabase.auth.getSession().then(async ({ data }) => {
  session = data.session
  await loadProfile()
  emit()
  if (session) startSync()
})
supabase.auth.onAuthStateChange((event, s) => {
  const was = session?.user.id
  session = s
  if (event === 'SIGNED_OUT') { profile = null; stopSync(); emit(); return }
  if (s && s.user.id !== was) loadProfile().then(() => { emit(); startSync() })
  else emit()
})

export function useAccount() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick((n) => n + 1)
    listeners.add(f)
    return () => { listeners.delete(f) }
  }, [])
  return { session, profile, user: session?.user ?? null }
}

export const currentUserId = () => session?.user.id ?? null

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/
export const cleanUsername = (s: string) => s.trim().toLowerCase().replace(/^@/, '')

export async function usernameAvailable(name: string) {
  const u = cleanUsername(name)
  if (!USERNAME_RE.test(u)) return false
  const { data } = await supabase.rpc('username_available', { name: u })
  return !!data
}

export async function signUp(email: string, password: string, username: string, displayName: string) {
  const u = cleanUsername(username)
  if (!USERNAME_RE.test(u)) throw new Error('Usernames are 3 to 20 letters, numbers, dots or underscores.')
  if (!(await usernameAvailable(u))) throw new Error(`@${u} is taken. Try another one.`)
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(), password,
    options: { data: { username: u, display_name: displayName.trim() } },
  })
  if (error) throw new Error(friendly(error.message))
  return { needsConfirm: !data.session }
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(friendly(error.message))
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function updateDisplayName(name: string) {
  if (!session) return
  await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', session.user.id)
  await loadProfile()
  emit()
}

function friendly(m: string) {
  if (/invalid login/i.test(m)) return 'That email and password don’t match.'
  if (/email not confirmed/i.test(m)) return 'Check your email and tap the confirm link first.'
  if (/already registered/i.test(m)) return 'There’s already an account with that email. Sign in instead.'
  if (/password/i.test(m) && /6/.test(m)) return 'Passwords need at least 6 characters.'
  if (/rate limit/i.test(m)) return 'Too many tries. Wait a minute and try again.'
  return m
}

export async function findUser(username: string) {
  const { data } = await supabase.from('profiles').select('id, username, display_name').eq('username', cleanUsername(username)).maybeSingle()
  return data as Profile | null
}

// ---------- Which trips are shared ----------

const SHARED_KEY = 'meander.shared'
function readShared(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SHARED_KEY) || '{}') } catch { return {} }
}
let shared: Record<string, string> = readShared() // tripId -> last pulled server time
const saveShared = () => { try { localStorage.setItem(SHARED_KEY, JSON.stringify(shared)) } catch { /* ignore */ } }
export const isShared = (tripId: string) => tripId in shared

export function useSharedIds() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick((n) => n + 1)
    listeners.add(f)
    return () => { listeners.delete(f) }
  }, [])
  return shared
}

// ---------- Outgoing changes ----------

type Kind = 'trip' | 'stop' | 'day' | 'expense' | 'check'
interface Pending { trip_id: string; kind: Kind; row_id: string; data: unknown; deleted: boolean }
const QUEUE_KEY = 'meander.outbox'
let outbox: Record<string, Pending> = (() => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}') } catch { return {} } })()
const saveOutbox = () => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(outbox)) } catch { /* ignore */ } }

let applying = false // true while we write remote changes into Dexie, so hooks don't echo them back
let flushTimer: number | undefined

function queue(kind: Kind, row: { id: string; tripId?: string }, deleted: boolean) {
  if (applying) return
  const tripId = kind === 'trip' ? row.id : row.tripId
  if (!tripId || !isShared(tripId)) return
  outbox[`${tripId}|${kind}|${row.id}`] = { trip_id: tripId, kind, row_id: row.id, data: row, deleted }
  saveOutbox()
  window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(flush, 1200)
}

let flushing = false
export async function flush() {
  if (flushing || !session || !navigator.onLine) return
  const items = Object.entries(outbox)
  if (!items.length) return
  flushing = true
  try {
    const rows = items.map(([, p]) => p)
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('trip_rows').upsert(rows.slice(i, i + 200), { onConflict: 'trip_id,kind,row_id' })
      if (error) throw error
    }
    for (const [k, p] of items) if (outbox[k] === p) delete outbox[k]
    saveOutbox()
  } catch (e) {
    console.warn('[meander] sync push failed', e)
  } finally {
    flushing = false
  }
}

const TABLES = { trip: db.trips, stop: db.stops, day: db.days, expense: db.expenses, check: db.checks } as const

for (const [kind, table] of Object.entries(TABLES) as [Kind, (typeof TABLES)[Kind]][]) {
  // Dexie hooks see every local write, wherever it comes from in the app.
  const t = table as unknown as import('dexie').Table<{ id: string; tripId?: string }, string>
  t.hook('creating', (_k, obj) => { queue(kind, obj, false) })
  t.hook('updating', (mods, _k, obj) => {
    const next = { ...obj }
    for (const [key, v] of Object.entries(mods as Record<string, unknown>)) {
      if (v === undefined) delete (next as Record<string, unknown>)[key]
      else (next as Record<string, unknown>)[key] = v
    }
    queue(kind, next, false)
  })
  t.hook('deleting', (_k, obj) => { if (obj) queue(kind, obj, true) })
}

// ---------- Incoming changes ----------

interface RemoteRow { trip_id: string; kind: Kind; row_id: string; data: Record<string, unknown>; deleted: boolean; updated_at: string }

async function applyRows(rows: RemoteRow[]) {
  if (!rows.length) return
  applying = true
  try {
    await db.transaction('rw', [db.trips, db.stops, db.days, db.expenses, db.checks], async () => {
      for (const r of rows) {
        if (outbox[`${r.trip_id}|${r.kind}|${r.row_id}`]) continue // our own newer edit is waiting to send
        const table = TABLES[r.kind] as unknown as import('dexie').Table<unknown, string>
        if (!table) continue
        if (r.deleted) await table.delete(r.row_id)
        else await table.put(r.data)
      }
    })
  } finally {
    applying = false
  }
  for (const r of rows) {
    if (!(r.trip_id in shared)) continue
    if (!shared[r.trip_id] || r.updated_at > shared[r.trip_id]) shared[r.trip_id] = r.updated_at
  }
  saveShared()
}

async function pullTrip(tripId: string) {
  const since = shared[tripId]
  let q = supabase.from('trip_rows').select('trip_id, kind, row_id, data, deleted, updated_at').eq('trip_id', tripId).order('updated_at').limit(5000)
  // Small overlap so rows committed slightly out of order are never missed.
  if (since) q = q.gt('updated_at', new Date(new Date(since).getTime() - 10000).toISOString())
  const { data, error } = await q
  if (error) throw error
  await applyRows((data ?? []) as RemoteRow[])
}

/** Finds trips I've been added to (on any device) and pulls what changed on each. */
export async function pullAll() {
  if (!session || !navigator.onLine) return
  const { data: mine } = await supabase.from('trip_members').select('trip_id').eq('user_id', session.user.id)
  const ids = new Set((mine ?? []).map((m) => m.trip_id as string))
  let changed = false
  for (const id of ids) if (!(id in shared)) { shared[id] = ''; changed = true }
  // Trips I was removed from (or that were deleted) stop syncing but stay on this device.
  for (const id of Object.keys(shared)) if (!ids.has(id)) { delete shared[id]; changed = true }
  if (changed) { saveShared(); emit() }
  for (const id of ids) await pullTrip(id).catch((e) => console.warn('[meander] pull failed', e))
}

let channel: ReturnType<typeof supabase.channel> | null = null
let pollTimer: number | undefined
const onFocus = () => { if (document.visibilityState === 'visible') syncNow() }

export async function syncNow() {
  await flush()
  await pullAll()
  invitesChanged()
}

function startSync() {
  stopSync()
  syncNow()
  pollTimer = window.setInterval(syncNow, 45000)
  window.addEventListener('online', syncNow)
  document.addEventListener('visibilitychange', onFocus)
  channel = supabase
    .channel('meander-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_rows' }, (p) => {
      const r = p.new as RemoteRow
      if (r?.trip_id && r.trip_id in shared) applyRows([r])
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_invites' }, () => invitesChanged())
    .subscribe()
}

function stopSync() {
  window.clearInterval(pollTimer)
  window.removeEventListener('online', syncNow)
  document.removeEventListener('visibilitychange', onFocus)
  if (channel) supabase.removeChannel(channel)
  channel = null
}

// ---------- Sharing a trip ----------

async function allRowsFor(tripId: string): Promise<Pending[]> {
  const trip = await db.trips.get(tripId)
  if (!trip) throw new Error('Trip not found')
  const rows: Pending[] = [{ trip_id: tripId, kind: 'trip', row_id: trip.id, data: trip, deleted: false }]
  const add = (kind: Kind, list: { id: string }[]) => list.forEach((r) => rows.push({ trip_id: tripId, kind, row_id: r.id, data: r, deleted: false }))
  add('stop', await db.stops.where('tripId').equals(tripId).toArray() as Stop[])
  add('day', await db.days.where('tripId').equals(tripId).toArray() as DayMeta[])
  add('expense', await db.expenses.where('tripId').equals(tripId).toArray() as Expense[])
  add('check', await db.checks.where('tripId').equals(tripId).toArray() as CheckItem[])
  return rows
}

/** Puts a trip online so others can join it. Safe to call again. */
export async function shareTrip(tripId: string) {
  if (!session) throw new Error('Sign in first')
  if (isShared(tripId)) return
  const trip = await db.trips.get(tripId) as Trip
  const { error } = await supabase.from('shared_trips').insert({ id: tripId, title: trip.name })
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message)
  const m = await supabase.from('trip_members').insert({ trip_id: tripId, user_id: session.user.id })
  if (m.error && !/duplicate/i.test(m.error.message)) throw new Error(m.error.message)
  shared[tripId] = ''
  saveShared()
  for (const p of await allRowsFor(tripId)) outbox[`${tripId}|${p.kind}|${p.row_id}`] = p
  saveOutbox()
  await flush()
  emit()
}

export interface Member { user_id: string; username: string; display_name: string; owner: boolean }

export async function tripMembers(tripId: string): Promise<Member[]> {
  const [{ data: t }, { data: m }] = await Promise.all([
    supabase.from('shared_trips').select('owner').eq('id', tripId).maybeSingle(),
    supabase.from('trip_members').select('user_id, profiles(username, display_name)').eq('trip_id', tripId),
  ])
  return ((m ?? []) as unknown as { user_id: string; profiles: { username: string; display_name: string } | null }[]).map((r) => ({
    user_id: r.user_id,
    username: r.profiles?.username ?? '',
    display_name: r.profiles?.display_name ?? '',
    owner: r.user_id === t?.owner,
  }))
}

export async function inviteLink(tripId: string) {
  await shareTrip(tripId)
  const { data, error } = await supabase.from('trip_invites').insert({ trip_id: tripId }).select('code').single()
  if (error) throw new Error(error.message)
  return `${WEB_URL}#/join/${data.code}`
}

export async function inviteUsername(tripId: string, username: string) {
  const who = await findUser(username)
  if (!who) throw new Error(`No one has the username @${cleanUsername(username)}.`)
  if (who.id === session?.user.id) throw new Error('That’s you!')
  await shareTrip(tripId)
  const { error } = await supabase.from('trip_invites').insert({ trip_id: tripId, invitee: who.id })
  if (error) throw new Error(error.message)
  return who
}

export async function pendingUsernameInvites(tripId: string) {
  const { data } = await supabase.from('trip_invites').select('code, invitee, profiles!trip_invites_invitee_fkey(username)').eq('trip_id', tripId).not('invitee', 'is', null)
  return ((data ?? []) as unknown as { code: string; profiles: { username: string } | null }[]).map((r) => ({ code: r.code, username: r.profiles?.username ?? '' }))
}

export async function removeMember(tripId: string, userId: string) {
  await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId)
}

/** Stop syncing a trip on this device. The owner deletes it for everyone; anyone else just leaves. */
export async function leaveOrDelete(tripId: string) {
  if (!isShared(tripId) || !session) return
  const { data: t } = await supabase.from('shared_trips').select('owner').eq('id', tripId).maybeSingle()
  if (t?.owner === session.user.id) await supabase.from('shared_trips').delete().eq('id', tripId)
  else await removeMember(tripId, session.user.id)
  delete shared[tripId]
  saveShared()
  for (const k of Object.keys(outbox)) if (k.startsWith(tripId + '|')) delete outbox[k]
  saveOutbox()
  emit()
}

/** Run a local write without sending it to the cloud (used when deleting a trip from this device). */
export async function quietly<T>(fn: () => Promise<T>) {
  applying = true
  try { return await fn() } finally { applying = false }
}

// ---------- Invites for me ----------

export interface MyInvite { code: string; trip_id: string; title: string; from: string; from_name: string }
const inviteListeners = new Set<() => void>()
function invitesChanged() { inviteListeners.forEach((f) => f()) }

export function useMyInvites() {
  const [list, setList] = useState<MyInvite[]>([])
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!session) { setList([]); return }
      const { data } = await supabase
        .from('trip_invites')
        .select('code, trip_id, shared_trips(title), profiles!trip_invites_created_by_fkey(username, display_name)')
        .eq('invitee', session.user.id)
        .gt('expires_at', new Date().toISOString())
      if (!alive) return
      setList(((data ?? []) as unknown as { code: string; trip_id: string; shared_trips: { title: string } | null; profiles: { username: string; display_name: string } | null }[]).map((r) => ({
        code: r.code, trip_id: r.trip_id, title: r.shared_trips?.title ?? 'A trip', from: r.profiles?.username ?? '', from_name: r.profiles?.display_name ?? '',
      })))
    }
    load()
    inviteListeners.add(load)
    listeners.add(load)
    return () => { alive = false; inviteListeners.delete(load); listeners.delete(load) }
  }, [])
  return list
}

export async function previewInvite(code: string) {
  const { data, error } = await supabase.rpc('invite_preview', { c: code })
  if (error) throw new Error(error.message)
  const row = (data as { trip_id: string; title: string; inviter: string; inviter_name: string; already_member: boolean }[])[0]
  return row ?? null
}

export async function acceptInvite(code: string) {
  const { data, error } = await supabase.rpc('accept_invite', { c: code })
  if (error) throw new Error(error.message)
  const tripId = data as string
  shared[tripId] = ''
  saveShared()
  await pullTrip(tripId)
  emit()
  invitesChanged()
  return tripId
}

export async function declineInvite(code: string) {
  await supabase.from('trip_invites').delete().eq('code', code)
  invitesChanged()
}

export function whatsappUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
