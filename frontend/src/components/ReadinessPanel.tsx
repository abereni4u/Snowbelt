// Storm readiness checklist (Role 3 layout). Each item is marked Have or Need; when every item is
// Have the person is "Safe". Items they still need go to Gemini as a question, so its answer is
// grounded in the same tools as the chat (nearby resources, conditions, alerts).
// Answers are saved on this device, and on the person's profile when they're signed in. Once
// everything is Have, they can send their emergency contacts an "I'm safe" message.
// Items still needed can go to the neighbor board as one supplies request for volunteers to pick up,
// and the volunteer hub puts volunteers whose skills fit those items first.
import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { api } from '../api'
import { db, firebaseReady } from '../firebase'
import type { Contact, NotifyResult, Place } from '../types'

// skills: the volunteer hub skills that can cover the item (same names as SKILLS in VolunteerHub)
const ITEMS = [
  { key: 'food', label: 'Food & water (3 days)', skills: ['Groceries & pharmacy runs'] },
  { key: 'meds', label: 'Medications', skills: ['Groceries & pharmacy runs'] },
  { key: 'light', label: 'Flashlights & batteries', skills: ['Groceries & pharmacy runs'] },
  { key: 'warm', label: 'Blankets & warm layers', skills: ['Groceries & pharmacy runs'] },
  { key: 'heat', label: 'Backup heat source', skills: ['Generator'] },
  { key: 'phone', label: 'Phone charged + power bank', skills: ['Generator'] },
  { key: 'transport', label: 'Transportation plan', skills: ['Rides to shelters', '4x4 / AWD vehicle'] },
]
export { ITEMS as READINESS_ITEMS }

interface SupplyRequest {
  id: string
  status: 'open' | 'claimed' | 'resolved'
  items?: string[]
  claimedByName?: string
  etaMinutes?: number
}

const roundToKm = (value: number) => Math.round(value * 100) / 100

type Answer = 'have' | 'need'
const STORAGE_KEY = 'snowbelt.checklist'

function loadAnswers(): Record<string, Answer> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

interface Props {
  place: Place
  user: User | null
  onAsk: (question: string) => void
  onNeedsChange: (keys: string[]) => void
}

export default function ReadinessPanel({ place, user, onAsk, onNeedsChange }: Props) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(loadAnswers)
  const [sending, setSending] = useState(false)
  const [sentNote, setSentNote] = useState('')
  const loadedFor = useRef<string | null>(null)
  const [request, setRequest] = useState<SupplyRequest | null>(null)
  const [posting, setPosting] = useState(false)
  const [requestError, setRequestError] = useState('')

  // Signing in brings back the checklist saved on the profile (answers on this device win)
  useEffect(() => {
    if (!db || !user) return
    getDoc(doc(db, 'users', user.uid))
      .then((snapshot) => {
        const saved = (snapshot.data()?.checklist ?? {}) as Record<string, Answer>
        setAnswers((current) => ({ ...saved, ...current }))
      })
      .catch(() => undefined)
      .finally(() => { loadedFor.current = user.uid })
  }, [user])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers))
    } catch {
      // storage blocked (private window); the checklist still works for this visit
    }
    if (db && user && loadedFor.current === user.uid) {
      setDoc(doc(db, 'users', user.uid), { checklist: answers }, { merge: true }).catch(() => undefined)
    }
  }, [answers, user])

  const haveCount = ITEMS.filter((item) => answers[item.key] === 'have').length
  const needed = ITEMS.filter((item) => answers[item.key] === 'need')
  const safe = haveCount === ITEMS.length
  const neededKeys = needed.map((item) => item.key).join(',')

  useEffect(() => {
    onNeedsChange(neededKeys ? neededKeys.split(',') : [])
  }, [neededKeys, onNeedsChange])

  // The supplies request this checklist posted, if it's still open or claimed (updates live)
  useEffect(() => {
    if (!db || !user) {
      setRequest(null)
      return
    }
    const mine = query(collection(db, 'helpRequests'), where('uid', '==', user.uid), where('source', '==', 'readiness'))
    return onSnapshot(mine, (snapshot) => {
      const active = snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<SupplyRequest, 'id'>) }))
        .find((item) => item.status !== 'resolved')
      setRequest(active ?? null)
    }, () => setRequest(null))
  }, [user])

  const neededLabels = needed.map((item) => item.label)
  const requestOutdated = request?.status === 'open' && (request.items ?? []).join('|') !== neededLabels.join('|')

  function mark(key: string, answer: Answer) {
    setAnswers((current) => ({ ...current, [key]: answer }))
  }

  async function tellContacts() {
    if (!db || !user) return
    setSending(true)
    setSentNote('')
    try {
      const contacts = ((await getDoc(doc(db, 'users', user.uid))).data()?.contacts ?? []) as Contact[]
      if (contacts.length === 0) {
        setSentNote('Add emergency contacts under "Ask for help" first.')
        return
      }
      const { results } = await api.notify(
        { kind: 'safe', note: '', lat: place.lat, lon: place.lon, display_name: user.displayName ?? '', contacts },
        await user.getIdToken(),
      )
      await setDoc(doc(db, 'users', user.uid), { safeAt: new Date().toISOString() }, { merge: true })
      const sent = results.filter((result: NotifyResult) => result.status === 'sent').length
      setSentNote(sent > 0
        ? `Sent to ${sent} of ${results.length} contact channels.`
        : "Saved, but nothing was sent: the server's email/SMS isn't set up yet.")
    } catch (caught) {
      setSentNote(caught instanceof Error ? caught.message : 'Could not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  async function requestSupplies() {
    if (!db || !user) return
    setPosting(true)
    setRequestError('')
    const note = `Getting ready for the storm. Still need: ${neededLabels.join(', ').toLowerCase()}.`
    try {
      if (request?.status === 'open') {
        await updateDoc(doc(db, 'helpRequests', request.id), { items: neededLabels, note })
      } else {
        await addDoc(collection(db, 'helpRequests'), {
          uid: user.uid,
          name: user.displayName ?? 'A neighbor',
          kind: 'supplies',
          note,
          items: neededLabels,
          source: 'readiness',
          priority: 4, // same as "supplies" in HelpPanel
          approxLat: roundToKm(place.lat),
          approxLon: roundToKm(place.lon),
          status: 'open',
          createdAt: serverTimestamp(),
        })
      }
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : 'Could not post the request. Try again.')
    } finally {
      setPosting(false)
    }
  }

  const scrollToCommunity = () => document.getElementById('community')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  function askGemini() {
    const list = needed.map((item) => item.label.toLowerCase()).join(', ')
    onAsk(`A storm is coming and I still need: ${list}. How can I get these near ${place.name} before the roads get bad?`)
  }

  return (
    <section className="card ready-card" id="readiness">
      <div className="card-head">
        <div className="row-between">
          <h2>Storm readiness</h2>
          <span className="muted mono">{haveCount}/{ITEMS.length} ready</span>
        </div>
        <p className="sub">
          <span className={`chip ${safe ? 'open' : 'med'}`}>{safe ? 'Safe' : 'Not yet confirmed'}</span>{' '}
          {safe ? 'You have everything on the list.' : 'Mark what you have so you know what to get before the storm.'}
        </p>
      </div>
      <ul className="rows">
        {ITEMS.map((item) => (
          <li key={item.key} className="ready-row">
            <span>{item.label}</span>
            <span className="have-need" role="group" aria-label={item.label}>
              <button aria-pressed={answers[item.key] === 'have'} onClick={() => mark(item.key, 'have')}>Have</button>
              <button aria-pressed={answers[item.key] === 'need'} className="need" onClick={() => mark(item.key, 'need')}>Need</button>
            </span>
          </li>
        ))}
      </ul>
      {safe && (
        <div className="ready-foot">
          {user ? (
            <button className="btn primary" onClick={tellContacts} disabled={sending}>{sending ? 'Sending…' : "Tell my contacts I'm safe"}</button>
          ) : (
            <p className="small muted">Sign in to save this and tell your emergency contacts you're safe.</p>
          )}
          {sentNote && <p className="small">{sentNote}</p>}
        </div>
      )}
      {needed.length > 0 && (
        <div className="ready-foot">
          <div className="community-actions">
            {user && !request && (
              <button className="btn primary" onClick={requestSupplies} disabled={posting}>
                {posting ? 'Posting…' : `Ask a volunteer to bring ${needed.length === 1 ? 'it' : 'these'}`}
              </button>
            )}
            {requestOutdated && (
              <button className="btn primary" onClick={requestSupplies} disabled={posting}>{posting ? 'Updating…' : 'Update my request'}</button>
            )}
            <button className={user && !request ? 'btn' : 'btn primary'} onClick={askGemini}>Ask Gemini how to get {needed.length === 1 ? 'it' : `these ${needed.length}`}</button>
          </div>
          {!user && firebaseReady && <p className="small muted">Sign in to ask a volunteer to bring what you need.</p>}
          {user && !request && <p className="small muted">Posts to the neighbor board for volunteers. Not for emergencies: if anyone's life may be in danger, <a href="tel:911">call 911</a> first.</p>}
          {requestError && <p className="small">{requestError}</p>}
        </div>
      )}
      {request && (
        <div className="ready-foot">
          <p className="small">
            {request.status === 'claimed' ? (
              <><span className="chip open">On the way</span> {request.claimedByName ?? 'A volunteer'} is bringing your supplies{request.etaMinutes != null ? ` (said about ${request.etaMinutes} min)` : ''}.</>
            ) : (
              <><span className="chip med">Waiting</span> Your supplies request is on the neighbor board: {(request.items ?? []).join(', ').toLowerCase()}.</>
            )}{' '}
            <button className="linkish" onClick={scrollToCommunity}>{request.status === 'claimed' ? 'Rate them when they arrive' : 'See or cancel it'}</button>
          </p>
        </div>
      )}
    </section>
  )
}
