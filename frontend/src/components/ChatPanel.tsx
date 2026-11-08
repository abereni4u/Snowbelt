// Gemini assistant panel (Role 1). Sends the conversation to /api/chat and shows what Gemini checked.
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { ChatMessage, DataMode, HelpDraft, Place, ToolCall } from '../types'

// Plain-language names for the tool calls, shown under each answer
const TOOL_LABEL: Record<string, string> = {
  lookupPlace: 'looked up a place',
  getConditions: 'checked snow conditions',
  getHighRiskAreas: 'checked high-risk towns',
  getRouteRisk: 'checked the route',
  findResources: 'found nearby help',
  getActiveAlerts: 'checked NWS alerts',
  draftHelpRequest: 'drafted a help request',
}

const SUGGESTIONS = [
  'Is it safe to drive to Orchard Park?',
  "Where's the nearest warming center?",
  "I'm snowed in and the heat is out",
]

interface Turn extends ChatMessage {
  tools?: ToolCall[]
}

interface Props {
  userLocation: Place
  hoursAhead: number
  dataMode: DataMode
  onHelpDraft: (draft: HelpDraft) => void
  // A question sent from elsewhere in the app (the readiness checklist); asked once, then cleared
  question: string
  onQuestionUsed: () => void
}

export default function ChatPanel({ userLocation, hoursAhead, dataMode, onHelpDraft, question, onQuestionUsed }: Props) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!question || busy) return
    onQuestionUsed()
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    send(question)
    // send is recreated every render; only a new question should trigger this
  }, [question, busy])

  async function send(text: string) {
    const question = text.trim()
    if (!question || busy) return
    const history: Turn[] = [...turns, { role: 'user', text: question }]
    setTurns(history)
    setInput('')
    setBusy(true)
    setError('')
    try {
      const reply = await api.chat(
        history.map(({ role, text: body }) => ({ role, text: body })),
        userLocation.lat, userLocation.lon, hoursAhead, dataMode,
      )
      setTurns([...history, { role: 'assistant', text: reply.reply, tools: reply.tool_calls }])
      if (reply.help_draft) onHelpDraft(reply.help_draft)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }))
    }
  }

  return (
    <section className="card ai-card" ref={cardRef}>
      <div className="card-head row-between">
        <h2>AI assistance</h2>
        <span className="muted small">Powered by Gemini</span>
      </div>
      <div className="msgs" ref={listRef} aria-live="polite">
        <div className="msg bot">Ask about snow near you, a drive you're planning, or where to find help.</div>
        {turns.map((turn, index) => (
          <div key={index} className={`msg ${turn.role === 'user' ? 'user' : 'bot'}`}>
            {turn.text}
            {turn.tools && turn.tools.length > 0 && (
              <div className="tools">Gemini {[...new Set(turn.tools.map((tool) => TOOL_LABEL[tool.name] ?? tool.name))].join(', ')}.</div>
            )}
          </div>
        ))}
        {busy && <div className="msg bot pending">Thinking…</div>}
        {error && <div className="msg note">{error}</div>}
      </div>
      <div className="suggest">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} disabled={busy} onClick={() => send(suggestion)}>{suggestion}</button>
        ))}
      </div>
      <form className="ask" onSubmit={(event) => { event.preventDefault(); send(input) }}>
        <label htmlFor="ask-input" className="sr">Ask the assistant</label>
        <input id="ask-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about snow, roads or shelters" autoComplete="off" />
        <button type="submit" disabled={busy}>Ask</button>
      </form>
    </section>
  )
}
