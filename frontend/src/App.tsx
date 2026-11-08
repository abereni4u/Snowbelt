/*
  Snowbelt app shell (Role 3 owns layout and the map; each panel has its owner noted in its file).

  State that several panels share lives here:
    - where the user is (browser location, falling back to UB North Campus)
    - which place is selected on the map
    - the time being viewed (0 = now, up to +24 h) and data mode (live sample or 2022 replay)
    - a help request Gemini drafted, handed to the help panel for the user to confirm
    - a question for Gemini from the readiness checklist, and the route shown on the map
*/
import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { api } from './api'
import { auth, firebaseReady, signInWithGoogle, signOutUser } from './firebase'
import type { AreaRow, DataMode, HelpDraft, NwsAlert, Place, Resource, RiskGrid, RoutePlan } from './types'
import MapView from './components/MapView'
import TimeControl from './components/TimeControl'
import AreaPanel from './components/AreaPanel'
import RiskList from './components/RiskList'
import ShelterList from './components/ShelterList'
import LocationSearch from './components/LocationSearch'
import ReadinessPanel from './components/ReadinessPanel'
import RoutePanel from './components/RoutePanel'
import DemoCommunity from './components/DemoCommunity'
import VolunteerHub from './components/VolunteerHub'
import ChatPanel from './components/ChatPanel'
import HelpPanel from './components/HelpPanel'

const FALLBACK_LOCATION: Place = { name: 'UB North Campus', lat: 43.001, lon: -78.789 }
// The demo story: a Lackawanna resident during the Nov 2022 replay, where the heaviest band sat
const DEMO_LOCATION: Place = { name: 'Lackawanna', lat: 42.825, lon: -78.823 }

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
  const [chatQuestion, setChatQuestion] = useState('')
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null)
  const [stormPing, setStormPing] = useState('')
  const [error, setError] = useState('')

  // Browser location, if the user allows it
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      // Keep a place the user already searched for if the browser answers late
      (position) => setUserLocation((current) => (current === FALLBACK_LOCATION ? { name: 'Your location', lat: position.coords.latitude, lon: position.coords.longitude } : current)),
      () => undefined,
      { timeout: 8000 },
    )
  }, [])

  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), [])

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
      .catch(() => !cancelled && setError("Can't reach the backend. Is it running on port 8000?"))
    return () => {
      cancelled = true
    }
  }, [hoursAhead, dataMode])

  const focusPlace = selected ?? userLocation

  function startDemo() {
    setDataMode('replay')
    setHoursAhead(0)
    setUserLocation(DEMO_LOCATION)
    setSelected(null)
    api.conditions(DEMO_LOCATION.lat, DEMO_LOCATION.lon, 0, 'replay')
      .then((now) => setStormPing(`Heavy lake-effect bands are over ${DEMO_LOCATION.name}: ${now.rate_in_hr.toFixed(1)} in/hr now and ${now.next_6h_in} more inches in the next 6 hours. Finish your readiness checklist before the roads close.`))
      .catch(() => setStormPing(`Heavy lake-effect bands are heading for ${DEMO_LOCATION.name}. Finish your readiness checklist before the roads close.`))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="app">
      <header className="top">
        <div className="plaque">
          <div className="plaque-in">
            <span className="plaque-name">Snowbelt</span>
            <span className="plaque-sub">Western New York</span>
          </div>
        </div>
        <nav className="top-nav" aria-label="Sections">
          <button onClick={() => scrollTo('map')}>Map</button>
          <button onClick={() => scrollTo('readiness')}>Readiness</button>
          <button onClick={() => scrollTo('community')}>Community</button>
          <button onClick={() => scrollTo('volunteers')}>Volunteer hub</button>
        </nav>
        <div className="top-actions">
          <button className="btn" onClick={startDemo}>Start demo</button>
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
        <span className="tag">{dataMode === 'replay' ? 'Replay' : 'Sample data'}</span>
        Snow numbers come from a sample model until live NWS data is wired in.
        <a href="https://www.weather.gov/buf" target="_blank" rel="noreferrer">Real conditions: NWS Buffalo</a>
      </p>
      <LocationSearch areas={areas} onFound={(place) => { setUserLocation(place); setSelected(null) }} />
      {stormPing && (
        <div className="storm-ping" role="alert">
          <div>
            <strong>Storm ping · Lake-effect snow warning</strong>
            <p>{stormPing}</p>
          </div>
          <div className="storm-ping-actions">
            <button className="btn primary" onClick={() => { setStormPing(''); scrollTo('readiness') }}>Open checklist</button>
            <button className="btn" onClick={() => setStormPing('')}>Dismiss</button>
          </div>
        </div>
      )}
      {alerts.length > 0 && (
        <div className="alert-bar" role="status">
          <strong>{alerts[0].event}</strong> {alerts[0].headline}
        </div>
      )}
      {error && <div className="error-bar">{error}</div>}

      <main className="grid">
        <section className="card map-card" id="map">
          <div className="card-head">
            <h2>Storm total snowfall</h2>
            <p className="sub">Tap a town, pin or any spot to check it.</p>
          </div>
          <MapView grid={grid} resources={resources} userLocation={userLocation} selected={selected} route={routePlan} onPick={setSelected} />
          <TimeControl hoursAhead={hoursAhead} onHoursChange={setHoursAhead} dataMode={dataMode} onDataModeChange={setDataMode} />
        </section>

        <AreaPanel place={focusPlace} isUser={selected === null} hoursAhead={hoursAhead} dataMode={dataMode} onReset={() => setSelected(null)} />
        <RoutePanel origin={userLocation} resources={resources} areas={areas} hoursAhead={hoursAhead} dataMode={dataMode} onPlan={setRoutePlan} />
        <ChatPanel userLocation={userLocation} hoursAhead={hoursAhead} dataMode={dataMode} onHelpDraft={setHelpDraft} question={chatQuestion} onQuestionUsed={() => setChatQuestion('')} />
        <div className="lower">
          <div className="col">
            <ReadinessPanel place={userLocation} onAsk={setChatQuestion} />
            <DemoCommunity draft={helpDraft} onDraftUsed={() => setHelpDraft(null)} onAskGemini={setChatQuestion} />
          </div>
          <div className="col">
            <ShelterList resources={resources} onPick={setSelected} />
            <RiskList areas={areas} hoursAhead={hoursAhead} onPick={(row) => setSelected({ name: row.town, lat: row.lat, lon: row.lon })} />
            <VolunteerHub />
          </div>
        </div>
        {firebaseReady && <HelpPanel user={user} userLocation={userLocation} draft={null} onDraftUsed={() => setHelpDraft(null)} />}
      </main>
    </div>
  )
}
