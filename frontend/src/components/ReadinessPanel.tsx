// Storm readiness checklist (Role 3 layout). Each item is marked Have or Need; when every item is
// Have the person is "Safe". Items they still need go to Gemini as a question, so its answer is
// grounded in the same tools as the chat (nearby resources, conditions, alerts).
// Answers are saved on this device, and on the person's profile when they're signed in. Once
// everything is Have, they can send their emergency contacts an "I'm safe" message.
import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { api } from '../api'
import { db } from '../firebase'
import type { Contact, NotifyResult, Place } from '../types'

const ITEMS = [
  { key: 'food', label: 'Food & water (3 days)' },
  { key: 'meds', label: 'Medications' },
  { key: 'light', label: 'Flashlights & batteries' },
  { key: 'warm', label: 'Blankets & warm layers' },
  { key: 'heat', label: 'Backup heat source' },
  { key: 'phone', label: 'Phone charged + power bank' },
  { key: 'transport', label: 'Transportation plan' },
]

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
}

export default function ReadinessPanel({ place, user, onAsk }: Props) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(loadAnswers)
  const [sending, setSending] = useState(false)
  const [sentNote, setSentNote] = useState('')
  const loadedFor = useRef<string | null>(null)

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
          <button className="btn primary" onClick={askGemini}>Ask Gemini how to get {needed.length === 1 ? 'it' : `these ${needed.length}`}</button>
        </div>
      )}
    </section>
  )
}
