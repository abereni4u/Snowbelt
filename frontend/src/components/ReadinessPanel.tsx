// Storm readiness checklist (Role 3 layout). Each item is marked Have or Need; when every item is
// Have the person is "Safe". Items they still need go to Gemini as a question, so its answer is
// grounded in the same tools as the chat (nearby resources, conditions, alerts).
// Answers are saved on this device only.
import { useEffect, useState } from 'react'
import type { Place } from '../types'

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
  onAsk: (question: string) => void
}

export default function ReadinessPanel({ place, onAsk }: Props) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(loadAnswers)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers))
    } catch {
      // storage blocked (private window); the checklist still works for this visit
    }
  }, [answers])

  const haveCount = ITEMS.filter((item) => answers[item.key] === 'have').length
  const needed = ITEMS.filter((item) => answers[item.key] === 'need')
  const safe = haveCount === ITEMS.length

  function mark(key: string, answer: Answer) {
    setAnswers((current) => ({ ...current, [key]: answer }))
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
      {safe && <p className="ready-foot small">Marked Safe. Your emergency contacts (Mom, Sam) can see it. <span className="muted">(Demo)</span></p>}
      {needed.length > 0 && (
        <div className="ready-foot">
          <button className="btn primary" onClick={askGemini}>Ask Gemini how to get {needed.length === 1 ? 'it' : `these ${needed.length}`}</button>
        </div>
      )}
    </section>
  )
}
