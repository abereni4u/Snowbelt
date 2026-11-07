/*
  Community help (Role 4)

  - Emergency contacts: saved on the user's profile in Firestore (users/{uid}).
  - Ask for help: posts to the neighbor board (helpRequests, location rounded to about 1 km)
    and asks the backend to email/text the user's emergency contacts with the exact location.
  - Neighbor board: open requests, newest first. Anyone signed in can offer to help;
    the person who asked can mark it resolved.

  Firestore security rules for all of this are in firebase/firestore.rules.
*/
import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, type Timestamp,
} from 'firebase/firestore'
import { api } from '../api'
import { db, firebaseReady, signInWithGoogle } from '../firebase'
import { HELP_KIND_LABEL, type Contact, type HelpDraft, type HelpKind, type NotifyResult, type Place } from '../types'

interface HelpRequest {
  id: string
  uid: string
  name: string
  kind: HelpKind
  note: string
  approxLat: number
  approxLon: number
  status: 'open' | 'claimed' | 'resolved'
  claimedByName?: string
  createdAt?: Timestamp
}

const roundToKm = (value: number) => Math.round(value * 100) / 100

function milesBetween(a: Place, latB: number, lonB: number) {
  const eastKm = (lonB - a.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180)
  const northKm = (latB - a.lat) * 111
  return Math.hypot(eastKm, northKm) * 0.621371
}

interface Props {
  user: User | null
  userLocation: Place
  draft: HelpDraft | null
  onDraftUsed: () => void
}

export default function HelpPanel({ user, userLocation, draft, onDraftUsed }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [kind, setKind] = useState<HelpKind>('check_on_me')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<NotifyResult[] | null>(null)
  const [message, setMessage] = useState('')
  const [board, setBoard] = useState<HelpRequest[]>([])
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
    if (!db || !user) return
    getDoc(doc(db, 'users', user.uid)).then((snapshot) => setContacts((snapshot.data()?.contacts as Contact[]) ?? []))
    const newest = query(collection(db, 'helpRequests'), orderBy('createdAt', 'desc'), limit(30))
    return onSnapshot(newest, (snapshot) =>
      setBoard(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<HelpRequest, 'id'>) })).filter((item) => item.status !== 'resolved')),
    )
  }, [user])

  if (!firebaseReady) {
    return (
      <section className="card help-card">
        <h2>Community help</h2>
        <p className="muted">Add the Firebase settings to frontend/.env.local to turn on sign-in, emergency contacts and the neighbor help board.</p>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="card help-card">
        <h2>Community help</h2>
        <p className="muted">Sign in to save emergency contacts, ask neighbors for help, or help someone nearby.</p>
        <button className="btn primary" onClick={() => signInWithGoogle()}>Sign in with Google</button>
      </section>
    )
  }

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
      setMessage(contacts.length > 0 ? 'Posted to neighbors and sent to your contacts.' : 'Posted to neighbors. Add emergency contacts so they get alerts too.')
      setNote('')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not send. Try again, or call 911 if this is an emergency.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card help-card">
      <h2>Community help</h2>
      <p className="warn">If anyone's life is in danger, call 911 first. Snowbelt does not contact emergency services.</p>

      <form className="help-form" ref={formRef} onSubmit={askForHelp}>
        <h3>Ask for help</h3>
        <label>
          What's going on?
          <select value={kind} onChange={(event) => setKind(event.target.value as HelpKind)}>
            {Object.entries(HELP_KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Note for neighbors and contacts
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="e.g. Car stuck at the end of my driveway, I have a shovel" />
        </label>
        <p className="muted small">Neighbors see your area to within about half a mile. Your emergency contacts get your exact location.</p>
        <button className="btn primary" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send help request'}</button>
        {message && <p className="small">{message}</p>}
        {results && (
          <ul className="results">
            {results.map((result, index) => <li key={index}>{result.channel} to {result.to}: {result.status.replace('_', ' ')}</li>)}
          </ul>
        )}
      </form>

      <div className="contacts">
        <h3>Emergency contacts</h3>
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
        {board.length === 0 && <p className="muted small">No open requests nearby.</p>}
        {board.map((item) => (
          <div key={item.id} className="board-row">
            <div>
              <b>{HELP_KIND_LABEL[item.kind] ?? item.kind}</b>
              <span className="muted small"> · {item.name} · {milesBetween(userLocation, item.approxLat, item.approxLon).toFixed(1)} mi away</span>
              {item.note && <p className="small">{item.note}</p>}
              {item.status === 'claimed' && <p className="small">{item.claimedByName ?? 'Someone'} is on the way.</p>}
            </div>
            {item.uid === user.uid ? (
              <button className="btn" onClick={() => db && updateDoc(doc(db, 'helpRequests', item.id), { status: 'resolved' })}>Mark resolved</button>
            ) : (
              item.status === 'open' && (
                <button className="btn primary" onClick={() => db && updateDoc(doc(db, 'helpRequests', item.id), { status: 'claimed', claimedBy: user.uid, claimedByName: user.displayName ?? 'A neighbor' })}>
                  I can help
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
