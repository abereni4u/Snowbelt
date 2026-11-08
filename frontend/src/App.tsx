/*
  Snowbelt app shell (Role 3 owns layout and the map; each panel has its owner noted in its file).

  State that several panels share lives here:
    - where the user is (browser location, falling back to UB North Campus)
    - which place is selected on the map
    - the time being viewed (0 = now, up to +24 h) and data mode (live NWS forecast or 2022 replay)
    - a help request Gemini drafted, handed to the help panel for the user to confirm
    - a question for Gemini from the readiness checklist, and the route shown on the map
*/
import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { api } from './api'
import { auth, firebaseReady, onSignInError, signInWithGoogle, signOutUser } from './firebase'
import type { AreaRow, Conditions, DataMode, HelpDraft, NwsAlert, Place, Resource, RiskGrid, RoutePlan } from './types'
import MapView from './components/MapView'
import TimeControl from './components/TimeControl'
import AreaPanel from './components/AreaPanel'
import RiskList from './components/RiskList'
import ShelterList from './components/ShelterList'
import LocationSearch from './components/LocationSearch'
import ReadinessPanel from './components/ReadinessPanel'
import RoutePanel from './components/RoutePanel'
import VolunteerHub from './components/VolunteerHub'
import Snowfall from './components/Snowfall'
import ChatPanel from './components/ChatPanel'
import HelpPanel from './components/HelpPanel'

const FALLBACK_LOCATION: Place = { name: 'UB North Campus', lat: 43.001, lon: -78.789 }
// NWS alerts that mean "get ready now"
const WINTER_ALERT = /lake effect snow|winter storm|blizzard|snow squall|ice storm|winter weather/i

const DATA_NOTICE: Record<string, [string, string]> = {
  nws: ['Live NWS', 'Snowfall from the National Weather Service forecast, refreshed every 30 minutes.'],
  replay: ['Replay', 'Illustrative replay of the Nov 17-20, 2022 lake-effect storm, not observed data.'],
  sample: ['Sample data', "Live NWS data isn't available right now, so snow numbers come from a sample storm."],
}

function stormMessage(alerts: NwsAlert[], now: Conditions | null, place: Place, mode: DataMode): string {
  const winter = alerts.find((alert) => WINTER_ALERT.test(alert.event))
  if (mode === 'live' && winter) return `${winter.event} for Western New York. ${winter.headline}`
  if (now && (now.level === 'high' || now.next_6h_in >= 4)) {
    const replay = mode === 'replay' ? ' (2022 replay)' : ''
    return `Heavy snow near ${place.name}${replay}: ${now.rate_in_hr.toFixed(1)} in/hr now and ${now.next_6h_in} more inches in the next 6 hours.`
  }
  return ''
}

export default function App() {
  const [userLocation, setUserLocation] = useState<Place>(FALLBACK_LOCATION)
  const [selected, setSelected] = useState<Place | null>(null)
  const [hoursAhead, setHoursAhead] = useState(0)
  const [dataMode, setDataMode] = useState<DataMode>('live')
  const [grid, setGrid] = useState<RiskGrid | null>(null)
  const [areas, setAreas] = useState<AreaRow[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [alerts, setAlerts] = useState<NwsAlert[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [helpDraft, setHelpDraft] = useState<HelpDraft | null>(null)
  const [readinessNeeds, setReadinessNeeds] = useState<string[]>([])
  const [chatQuestion, setChatQuestion] = useState('')
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null)
  const [userNow, setUserNow] = useState<Conditions | null>(null)
  const [pingDismissed, setPingDismissed] = useState('')
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [slowStart, setSlowStart] = useState(false)

  // Browser location, if the user allows it
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      // Keep a place the user already searched for if the browser answers late
      (position) => setUserLocation((current) => (current === FALLBACK_LOCATION ? { name: 'Your location', lat: position.coords.latitude, lon: position.coords.longitude } : current)),
      () => undefined,
      { timeout: 8000 },
    )
  }, [])

  // The hosted backend sleeps when idle (Render free plan); say so if the first load is slow
  useEffect(() => {
    const timer = window.setTimeout(() => setSlowStart(true), 4000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), [])
  useEffect(() => onSignInError(setAuthError), [])

  useEffect(() => {
    api.resources(userLocation.lat, userLocation.lon).then(setResources).catch(() => undefined)
    api.alerts().then(setAlerts).catch(() => undefined)
  }, [userLocation])

  useEffect(() => {
    let cancelled = false
    Promise.all([api.risk(hoursAhead, dataMode), api.areas(hoursAhead, dataMode)])
      .then(([gridData, areaData]) => {
        if (cancelled) return
        setGrid(gridData)
        setAreas(areaData)
        setError('')
      })
      .catch(() => !cancelled && setError(import.meta.env.DEV
        ? "Can't reach the backend. Is it running on port 8000?"
        : "Can't reach the server right now. Refresh the page in a minute."))
    return () => {
      cancelled = true
    }
  }, [hoursAhead, dataMode])

  // Conditions where the user is, right now, for the storm warning
  useEffect(() => {
    api.conditions(userLocation.lat, userLocation.lon, 0, dataMode).then(setUserNow).catch(() => setUserNow(null))
  }, [userLocation, dataMode])

  const focusPlace = selected ?? userLocation
  const stormPing = stormMessage(alerts, userNow, userLocation, dataMode)
  const [noticeTag, noticeText] = DATA_NOTICE[grid?.source ?? (dataMode === 'replay' ? 'replay' : 'nws')] ?? DATA_NOTICE.sample

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="app">
      <Snowfall />
      <header className="top">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {[0, 60, 120].map((angle) => (
                <g key={angle} transform={`rotate(${angle} 16 16)`}>
                  <path d="M16 3v26" />
                  <path d="M12.5 6.5 16 9l3.5-2.5M12.5 25.5 16 23l3.5 2.5" />
                </g>
              ))}
            </g>
          </svg>
          <span className="brand-text">
            <span className="brand-name">Snowbelt</span>
            <span className="brand-sub">Western New York</span>
          </span>
        </div>
        <nav className="top-nav" aria-label="Sections">
          <button onClick={() => scrollTo('map')}>Map</button>
          <button onClick={() => scrollTo('readiness')}>Readiness</button>
          <button onClick={() => scrollTo('community')}>Community</button>
          <button onClick={() => scrollTo('volunteers')}>Volunteer hub</button>
        </nav>
        <div className="top-actions">
          <span className="loc-pill">
            <span className="loc-dot" />
            {userLocation.name}
          </span>
          {firebaseReady &&
            (user ? (
              <button className="btn" onClick={() => signOutUser()}>Sign out</button>
            ) : (
              <button className="btn primary" onClick={() => signInWithGoogle()}>Sign in</button>
            ))}
        </div>
      </header>

      <p className="notice">
        <span className="tag">{noticeTag}</span>
        {noticeText}
        <a href="https://www.weather.gov/buf" target="_blank" rel="noreferrer">Real conditions: NWS Buffalo</a>
      </p>
      <LocationSearch areas={areas} onFound={(place) => { setUserLocation(place); setSelected(null) }} />
      {stormPing && stormPing !== pingDismissed && (
        <div className="storm-ping" role="alert">
          <div>
            <strong>Storm warning</strong>
            <p>{stormPing} Finish your readiness checklist before the roads get bad.</p>
          </div>
          <div className="storm-ping-actions">
            <button className="btn primary" onClick={() => { setPingDismissed(stormPing); scrollTo('readiness') }}>Open checklist</button>
            <button className="btn" onClick={() => setPingDismissed(stormPing)}>Dismiss</button>
          </div>
        </div>
      )}
      {alerts.length > 0 && !WINTER_ALERT.test(alerts[0].event) && (
        <div className="alert-bar" role="status">
          <strong>{alerts[0].event}</strong> {alerts[0].headline}
        </div>
      )}
      {slowStart && !grid && !error && (
        <div className="alert-bar" role="status">
          Waking up the server. It sleeps when no one is using it, so the first load can take up to a minute.
        </div>
      )}
      {error && <div className="error-bar">{error}</div>}
      {authError && (
        <div className="error-bar row-between" role="alert">
          <span>{authError}</span>
          <button className="linkish" onClick={() => setAuthError('')}>Dismiss</button>
        </div>
      )}

      <main className="grid">
        <div className="col">
          <section className="card map-card" id="map">
            <div className="card-head">
              <h2>Storm total snowfall</h2>
              <p className="sub">Tap a town, pin or any spot to check it.</p>
            </div>
            <MapView grid={grid} resources={resources} userLocation={userLocation} selected={selected} route={routePlan} onPick={setSelected} onLocate={(place) => { setUserLocation(place); setSelected(null) }} />
            <TimeControl hoursAhead={hoursAhead} onHoursChange={setHoursAhead} dataMode={dataMode} onDataModeChange={setDataMode} />
          </section>
          <RoutePanel origin={userLocation} resources={resources} areas={areas} hoursAhead={hoursAhead} dataMode={dataMode} onPlan={setRoutePlan} />
          <ReadinessPanel place={userLocation} user={user} onAsk={setChatQuestion} onNeedsChange={setReadinessNeeds} />
          <HelpPanel user={user} userLocation={userLocation} resources={resources} draft={helpDraft} onDraftUsed={() => setHelpDraft(null)} onAskGemini={setChatQuestion} />
        </div>

        {/* Two independent columns on desktop; on phones they merge and the cards follow the CSS order */}
        <div className="col">
          <AreaPanel place={focusPlace} isUser={selected === null} hoursAhead={hoursAhead} dataMode={dataMode} onReset={() => setSelected(null)} />
          <ChatPanel userLocation={userLocation} hoursAhead={hoursAhead} dataMode={dataMode} onHelpDraft={setHelpDraft} question={chatQuestion} onQuestionUsed={() => setChatQuestion('')} />
          <ShelterList resources={resources} onPick={setSelected} />
          <RiskList areas={areas} hoursAhead={hoursAhead} onPick={(row) => setSelected({ name: row.town, lat: row.lat, lon: row.lon })} />
          <VolunteerHub user={user} userLocation={userLocation} needs={readinessNeeds} />
        </div>
      </main>
    </div>
  )
}
