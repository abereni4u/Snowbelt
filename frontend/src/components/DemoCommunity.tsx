// Emergency ping flow, simulated for the demo (no accounts or messages are sent).
// Shows the vision: contacts are pinged first, the first "on my way" is shared with everyone so
// no one doubles up, and unanswered requests escalate to verified volunteers, then shelters.
import { useEffect, useRef, useState } from 'react'
import { HELP_KIND_LABEL, type HelpDraft, type HelpKind } from '../types'

type Reply = 'pinged' | 'declined' | 'coming' | 'covered'

interface Responder {
  name: string
  role: string
  reply: Reply
  detail?: string
}

const START: Responder[] = [
  { name: 'Mom', role: 'Emergency contact', reply: 'pinged' },
  { name: 'Sam (roommate)', role: 'Emergency contact', reply: 'pinged' },
  { name: 'Jordan R.', role: 'Verified volunteer · ★ 4.9 · 0.6 mi', reply: 'pinged' },
]

const REPLY_LABEL: Record<Reply, string> = {
  pinged: 'Pinged…',
  declined: "Can't make it",
  coming: 'On my way',
  covered: 'Told help is covered',
}

// Medical first, then heat, being stuck, food, and welfare checks
const PRIORITY: Record<HelpKind, number> = { medical: 1, no_heat: 2, stuck: 3, supplies: 4, check_on_me: 5 }

interface Props {
  draft: HelpDraft | null
  onDraftUsed: () => void
  onAskGemini: (question: string) => void
}

export default function DemoCommunity({ draft, onDraftUsed, onAskGemini }: Props) {
  const [kind, setKind] = useState<HelpKind>('supplies')
  const [note, setNote] = useState('')
  const [responders, setResponders] = useState<Responder[] | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (!draft) return
    setKind(draft.kind)
    setNote(draft.note)
    onDraftUsed()
  }, [draft, onDraftUsed])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function later(ms: number, update: (current: Responder[]) => Responder[]) {
    timers.current.push(window.setTimeout(() => setResponders((current) => (current ? update(current) : current)), ms))
  }

  function send() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setResponders(START)
    later(2500, (current) => current.map((item, index) => (index === 0 ? { ...item, reply: 'declined', detail: 'Roads closed in Hamburg' } : item)))
    later(5000, (current) => current.map((item, index) =>
      index === 2 ? { ...item, reply: 'coming', detail: 'ETA 15 min' } : item.reply === 'pinged' ? { ...item, reply: 'covered' } : item))
  }

  const helper = responders?.find((item) => item.reply === 'coming')

  return (
    <section className="card community-card" id="community">
      <div className="card-head">
        <div className="row-between">
          <h2>Ask for help</h2>
          <span className="chip unknown">Demo</span>
        </div>
        <p className="sub">Your emergency contacts are pinged first, then verified volunteers nearby.</p>
      </div>
      <div className="community-body">
        <p className="warn">If anyone's life may be in danger, <a href="tel:911">call 911</a> first. Snowbelt does not contact emergency services.</p>
        {kind === 'medical' && <p className="warn strong">Medical emergency: call 911 now. Your contacts are pinged too, at top priority.</p>}
        <label className="field">
          What's happening?
          <select value={kind} onChange={(event) => setKind(event.target.value as HelpKind)}>
            {(Object.keys(HELP_KIND_LABEL) as HelpKind[]).map((key) => <option key={key} value={key}>{HELP_KIND_LABEL[key]}</option>)}
          </select>
        </label>
        <label className="field">
          Anything they should know?
          <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Out of food since yesterday, 2 kids at home" />
        </label>
        <div className="community-actions">
          <button className="btn primary" onClick={send}>Ping my contacts</button>
          {kind !== 'medical' && (
            <button className="linkish" onClick={() => onAskGemini(`${HELP_KIND_LABEL[kind]}. ${note} Should I wait or go now?`.trim())}>
              Not urgent? Ask Gemini instead
            </button>
          )}
        </div>

        {responders && (
          <div className="ping">
            <div className="ping-head">
              <b>Priority {PRIORITY[kind]} of 5 · {HELP_KIND_LABEL[kind]}</b>
              {helper ? (
                <span className="chip open">Help is on the way</span>
              ) : (
                <span className="chip med">Waiting for replies</span>
              )}
            </div>
            {helper && (
              <p className="ping-banner">
                {helper.name} is on the way ({helper.detail}). Everyone pinged has been told, so no one else drives out.
              </p>
            )}
            <ul className="ping-list">
              {responders.map((item) => (
                <li key={item.name}>
                  <span>
                    <b>{item.name}</b>
                    <span className="muted small"> · {item.role}</span>
                  </span>
                  <span className={`ping-reply ${item.reply}`}>
                    {REPLY_LABEL[item.reply]}{item.detail ? ` · ${item.detail}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {!helper && <p className="muted small">No reply in 10 minutes? It goes to more verified volunteers, then the nearest open shelter.</p>}
          </div>
        )}
      </div>
    </section>
  )
}
