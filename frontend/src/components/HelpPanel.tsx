/*
  Community help (Role 4)

  - Ask for help: posts to the neighbor board (helpRequests, location rounded to about 1 km)
    and asks the backend to email/text the user's emergency contacts with the exact location.
  - Your request: updates live. When someone taps "I can help" everyone sees it is covered, so no
    one else drives out. Unclaimed after 10 minutes, it points to the nearest shelter and 2-1-1.
  - When it's resolved, the person who asked can rate the helper (ratings feed the volunteer hub).
  - Neighbor board: open requests, most urgent first (medical, heat, stuck, supplies, check-ins).
  - Emergency contacts: saved on the user's profile in Firestore (users/{uid}).

  Firestore security rules for all of this are in firebase/firestore.rules.
*/
import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, type Timestamp,
} from 'firebase/firestore'
import { api } from '../api'
import { db, firebaseReady, signInWithGoogle } from '../firebase'
import { HELP_KIND_LABEL, type Contact, type HelpDraft, type HelpKind, type NotifyResult, type Place, type Resource } from '../types'

interface HelpRequest {
  id: string
  uid: string
  name: string
  kind: HelpKind
  note: string
  priority?: number
  approxLat: number
  approxLon: number
  status: 'open' | 'claimed' | 'resolved'
  claimedBy?: string
  claimedByName?: string
  etaMinutes?: number
  claimedAt?: Timestamp
  createdAt?: Timestamp
}

// Medical first, then heat, being stuck, food, and welfare checks
const PRIORITY: Record<HelpKind, number> = { medical: 1, no_heat: 2, stuck: 3, supplies: 4, check_on_me: 5 }
const ESCALATE_AFTER_MIN = 10
const ETA_OPTIONS = [5, 15, 30, 60]

const DELIVERY_LABEL: Record<NotifyResult['status'], string> = {
  sent: 'Sent',
  dry_run: "Not sent: the server's email/SMS isn't set up yet",
  failed: 'Failed to send',
}

const roundToKm = (value: number) => Math.round(value * 100) / 100

function milesBetween(a: Place, latB: number, lonB: number) {
  const eastKm = (lonB - a.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180)
  const northKm = (latB - a.lat) * 111
  return Math.hypot(eastKm, northKm) * 0.621371
}

const minutesSince = (stamp: Timestamp | undefined, now: number) => (stamp ? Math.max(0, Math.floor((now - stamp.toMillis()) / 60000)) : 0)
const priorityOf = (item: HelpRequest) => item.priority ?? PRIORITY[item.kind] ?? 5

interface Props {
  user: User | null
  userLocation: Place
  resources: Resource[]
  draft: HelpDraft | null
  onDraftUsed: () => void
  onAskGemini: (question: string) => void
}

export default function HelpPanel({ user, userLocation, resources, draft, onDraftUsed, onAskGemini }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [kind, setKind] = useState<HelpKind>('check_on_me')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<NotifyResult[] | null>(null)
  const [message, setMessage] = useState('')
  const [board, setBoard] = useState<HelpRequest[]>([])
  const [etaFor, setEtaFor] = useState<Record<string, number>>({})
  const [rating, setRating] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const formRef = useRef<HTMLFormElement>(null)

  // Gemini drafted a request in chat: fill the form and bring it into view for the user to confirm
  useEffect(() => {
    if (!draft) return
    setKind(draft.kind in HELP_KIND_LABEL ? draft.kind : 'check_on_me')
    setNote(draft.note)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onDraftUsed()
  }, [draft, onDraftUsed])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!db || !user) return
    getDoc(doc(db, 'users', user.uid)).then((snapshot) => setContacts((snapshot.data()?.contacts as Contact[]) ?? []))
    const newest = query(collection(db, 'helpRequests'), orderBy('createdAt', 'desc'), limit(50))
    return onSnapshot(newest, (snapshot) =>
      setBoard(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<HelpRequest, 'id'>) })).filter((item) => item.status !== 'resolved')),
    )
  }, [user])

  const head = (
    <div className="card-head">
      <h2>Ask for help</h2>
      <p className="sub">Your emergency contacts get your exact location. Neighbors and volunteers see your area on the board.</p>
    </div>
  )
  const warning = <p className="warn">If anyone's life may be in danger, <a href="tel:911">call 911</a> first. Snowbelt does not contact emergency services.</p>

  if (!firebaseReady || !user) {
    return (
      <section className="card community-card" id="community">
        {head}
        <div className="community-body">
          {warning}
          {firebaseReady ? (
            <>
              <p className="muted small">Sign in to save emergency contacts, ask for help, or help someone nearby.</p>
              <button className="btn primary self-start" onClick={() => signInWithGoogle()}>Sign in with Google</button>
            </>
          ) : (
            <p className="muted small">Add the Firebase settings to frontend/.env.local to turn on sign-in, emergency contacts and the help board.</p>
          )}
        </div>
      </section>
    )
  }

  const mine = board.filter((item) => item.uid === user.uid)
  const others = board
    .filter((item) => item.uid !== user.uid)
    .sort((a, b) => priorityOf(a) - priorityOf(b) || milesBetween(userLocation, a.approxLat, a.approxLon) - milesBetween(userLocation, b.approxLat, b.approxLon))
  const nearestShelter =
    resources.find((item) => !item.sample && (item.type === 'shelter' || item.type === 'warming_center')) ??
    resources.find((item) => item.type === 'shelter' || item.type === 'warming_center')

  const saveContacts = async (next: Contact[]) => {
    setContacts(next)
    if (db) await setDoc(doc(db, 'users', user.uid), { contacts: next, displayName: user.displayName ?? '' }, { merge: true })
  }

  const askForHelp = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!db) return
    setSending(true)
    setMessage('')
    setResults(null)
    try {
      await addDoc(collection(db, 'helpRequests'), {
        uid: user.uid,
        name: user.displayName ?? 'A neighbor',
        kind,
        note,
        priority: PRIORITY[kind],
        approxLat: roundToKm(userLocation.lat),
        approxLon: roundToKm(userLocation.lon),
        status: 'open',
        createdAt: serverTimestamp(),
      })
      if (contacts.length > 0) {
        const response = await api.notify(
          { kind, note, lat: userLocation.lat, lon: userLocation.lon, display_name: user.displayName ?? '', contacts },
          await user.getIdToken(),
        )
        setResults(response.results)
      }
      setMessage(contacts.length > 0 ? 'Posted to the help board and sent to your contacts.' : 'Posted to the help board. Add emergency contacts below so they get alerts too.')
      setNote('')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not send. Try again, or call 911 if this is an emergency.')
    } finally {
      setSending(false)
    }
  }

  const claim = (item: HelpRequest) =>
    db && updateDoc(doc(db, 'helpRequests', item.id), {
      status: 'claimed',
      claimedBy: user.uid,
      claimedByName: user.displayName ?? 'A neighbor',
      etaMinutes: etaFor[item.id] ?? 15,
      claimedAt: serverTimestamp(),
    })

  const resolve = async (item: HelpRequest, stars: number | null) => {
    if (!db) return
    if (stars && item.claimedBy) {
      await setDoc(doc(db, 'ratings', item.id), {
        helperUid: item.claimedBy, helperName: item.claimedByName ?? '', raterUid: user.uid, stars, createdAt: serverTimestamp(),
      })
    }
    await updateDoc(doc(db, 'helpRequests', item.id), { status: 'resolved' })
    setRating(null)
  }

  return (
    <section className="card community-card" id="community">
      {head}
      <div className="community-body">
        {warning}
        {kind === 'medical' && <p className="warn strong">Medical emergency: call 911 now. Your contacts are alerted too, at top priority.</p>}

        {mine.map((item) => {
          const waited = minutesSince(item.createdAt, now)
          const left = item.etaMinutes != null ? Math.max(0, item.etaMinutes - minutesSince(item.claimedAt, now)) : null
          return (
            <div key={item.id} className="ping">
              <div className="ping-head">
                <b>Your request · Priority {priorityOf(item)} of 5 · {HELP_KIND_LABEL[item.kind] ?? item.kind}</b>
                {item.status === 'claimed' ? <span className="chip open">Help is on the way</span> : <span className="chip med">Waiting · {waited} min</span>}
              </div>
              {item.status === 'claimed' && (
                <p className="ping-banner">
                  {item.claimedByName ?? 'A neighbor'} is on the way{left != null ? ` (about ${left} min)` : ''}. Everyone else sees this is covered.
                </p>
              )}
              {item.status === 'open' && waited >= ESCALATE_AFTER_MIN && (
                <p className="small">
                  No one has claimed this yet. Call 2-1-1 for help finding shelter or supplies
                  {nearestShelter && <>, or head to {nearestShelter.name}{nearestShelter.phone && <> (<a href={`tel:${nearestShelter.phone}`}>{nearestShelter.phone}</a>)</>} if the roads are safe</>}.
                </p>
              )}
              {rating === item.id ? (
                <div className="community-actions">
                  <span className="small">How did {item.claimedByName ?? 'they'} do?</span>
                  <span className="stars" role="group" aria-label="Rate your helper">
                    {[1, 2, 3, 4, 5].map((stars) => <button key={stars} onClick={() => resolve(item, stars)} aria-label={`${stars} stars`}>★</button>)}
                  </span>
                  <button className="linkish" onClick={() => resolve(item, null)}>Skip</button>
                </div>
              ) : (
                <div className="community-actions">
                  <button className="btn" onClick={() => (item.status === 'claimed' ? setRating(item.id) : resolve(item, null))}>
                    {item.status === 'claimed' ? "I'm OK now" : 'Cancel request'}
                  </button>
                </div>
              )}
            </div>
          )
        })}

        <form className="help-form" ref={formRef} onSubmit={askForHelp}>
          <label className="field">
            What's happening?
            <select value={kind} onChange={(event) => setKind(event.target.value as HelpKind)}>
              {(Object.keys(HELP_KIND_LABEL) as HelpKind[]).map((key) => <option key={key} value={key}>{HELP_KIND_LABEL[key]}</option>)}
            </select>
          </label>
          <label className="field">
            Anything they should know?
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="e.g. Out of food since yesterday, 2 kids at home" />
          </label>
          <div className="community-actions">
            <button className="btn primary" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Alert my contacts & neighbors'}</button>
            {kind !== 'medical' && (
              <button type="button" className="linkish" onClick={() => onAskGemini(`${HELP_KIND_LABEL[kind]}. ${note} Should I wait or go now?`.trim())}>
                Not urgent? Ask Gemini instead
              </button>
            )}
          </div>
          {message && <p className="small">{message}</p>}
          {results && (
            <ul className="ping-list">
              {results.map((result, index) => (
                <li key={index}>
                  <span>{result.channel === 'sms' ? 'Text' : 'Email'} to {result.to}</span>
                  <span className={`ping-reply ${result.status === 'sent' ? 'coming' : result.status === 'failed' ? 'declined' : ''}`}>{DELIVERY_LABEL[result.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="contacts">
          <h3>Emergency contacts</h3>
          {contacts.length === 0 && <p className="muted small">Add the people who should hear first when you ask for help.</p>}
          {contacts.map((contact, index) => (
            <div key={index} className="contact-row">
              <input aria-label="Name" value={contact.name} placeholder="Name" onChange={(event) => setContacts(contacts.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} onBlur={() => saveContacts(contacts)} />
              <input aria-label="Email" value={contact.email} placeholder="Email" onChange={(event) => setContacts(contacts.map((item, i) => (i === index ? { ...item, email: event.target.value } : item)))} onBlur={() => saveContacts(contacts)} />
              <input aria-label="Phone" value={contact.phone} placeholder="+17165551234" onChange={(event) => setContacts(contacts.map((item, i) => (i === index ? { ...item, phone: event.target.value } : item)))} onBlur={() => saveContacts(contacts)} />
              <button className="btn" type="button" onClick={() => saveContacts(contacts.filter((_, i) => i !== index))}>Remove</button>
            </div>
          ))}
          <button className="btn" type="button" onClick={() => setContacts([...contacts, { name: '', email: '', phone: '' }])}>Add contact</button>
        </div>

        <div className="board">
          <h3>Neighbors asking for help</h3>
          {others.length === 0 && <p className="muted small">No open requests right now.</p>}
          {others.map((item) => (
            <div key={item.id} className="board-row">
              <div>
                <b>{HELP_KIND_LABEL[item.kind] ?? item.kind}</b>
                <span className="muted small"> · Priority {priorityOf(item)} · {item.name} · {milesBetween(userLocation, item.approxLat, item.approxLon).toFixed(1)} mi · {minutesSince(item.createdAt, now)} min ago</span>
                {item.note && <p className="small">{item.note}</p>}
                {item.status === 'claimed' && <p className="small">{item.claimedBy === user.uid ? "You're" : `${item.claimedByName ?? 'Someone'} is`} on the way. This one is covered.</p>}
              </div>
              {item.status === 'open' && (
                <span className="claim">
                  <select aria-label="Your ETA" value={etaFor[item.id] ?? 15} onChange={(event) => setEtaFor({ ...etaFor, [item.id]: Number(event.target.value) })}>
                    {ETA_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                  </select>
                  <button className="btn primary" onClick={() => claim(item)}>I can help</button>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
