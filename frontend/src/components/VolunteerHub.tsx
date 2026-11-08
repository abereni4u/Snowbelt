// Volunteer hub (Role 4 data, Role 3 layout). Signed-in neighbors list themselves with their skills;
// their rating comes only from people they helped (ratings/{requestId}, written when a request is
// resolved). Reports go to reports/ for the team to review in the Firebase console.
// There is no ID check yet, so nothing here says "verified".
// Volunteers whose skills cover what the person's readiness checklist still needs are listed first.
import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, query, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db, firebaseReady, signInWithGoogle } from '../firebase'
import type { Place } from '../types'
import { READINESS_ITEMS } from './ReadinessPanel'

const SKILLS = ['4x4 / AWD vehicle', 'Snowblower', 'Shoveling', 'Groceries & pharmacy runs', 'Welfare checks', 'Rides to shelters', 'Generator']
const REPORT_REASONS = ['Did not show up', 'Unsafe or rude', 'Asked for money', 'Fake profile']

interface Volunteer {
  uid: string
  name: string
  skills: string[]
  approxLat: number
  approxLon: number
  test?: boolean
  updatedAt?: Timestamp
}

interface Rating {
  helperUid: string
  stars: number
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
  needs: string[]
}

export default function VolunteerHub({ user, userLocation, needs }: Props) {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [ratings, setRatings] = useState<Rating[]>([])
  const [editing, setEditing] = useState(false)
  const [skills, setSkills] = useState<string[]>([])
  const [reporting, setReporting] = useState<string | null>(null)
  const [reported, setReported] = useState<string[]>([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!db || !user) return
    // "permission denied" here means firebase/firestore.rules hasn't been published yet
    const failed = () => setLoadError("Couldn't load volunteers. The Firestore rules may need publishing.")
    const stopVolunteers = onSnapshot(query(collection(db, 'volunteers'), limit(200)), (snapshot) =>
      setVolunteers(snapshot.docs.map((item) => item.data() as Volunteer)), failed)
    const stopRatings = onSnapshot(query(collection(db, 'ratings'), limit(1000)), (snapshot) =>
      setRatings(snapshot.docs.map((item) => item.data() as Rating)), failed)
    return () => {
      stopVolunteers()
      stopRatings()
    }
  }, [user])

  const me = user ? volunteers.find((item) => item.uid === user.uid) : undefined

  useEffect(() => {
    if (me) setSkills(me.skills)
  }, [me])

  const head = (
    <div className="card-head">
      <h2>Volunteer hub</h2>
      <p className="sub">
        {needs.length > 0
          ? 'Neighbors who can help with what your readiness list still needs come first. Ratings come only from people they helped.'
          : 'Neighbors who can help, best rated first. Ratings come only from people they helped.'}
      </p>
    </div>
  )

  if (!firebaseReady || !user) {
    return (
      <section className="card volunteer-card" id="volunteers">
        {head}
        <div className="ready-foot">
          {firebaseReady ? (
            <>
              <p className="small muted">Sign in to see volunteers near you or sign up to help.</p>
              <button className="btn primary" onClick={() => signInWithGoogle()}>Sign in with Google</button>
            </>
          ) : (
            <p className="small muted">Add the Firebase settings to frontend/.env.local to turn on the volunteer hub.</p>
          )}
        </div>
      </section>
    )
  }

  const neededItems = READINESS_ITEMS.filter((item) => needs.includes(item.key))
  const scored = volunteers.map((person) => {
    const theirs = ratings.filter((item) => item.helperUid === person.uid)
    const average = theirs.length > 0 ? theirs.reduce((sum, item) => sum + item.stars, 0) / theirs.length : null
    const covers = person.uid === user.uid ? [] : neededItems.filter((item) => item.skills.some((skill) => person.skills.includes(skill)))
    return { ...person, average, covers, count: theirs.length, miles: milesBetween(userLocation, person.approxLat, person.approxLon) }
  })
  // Volunteers who cover the most of your needs first, then best rated, then nearest
  scored.sort((a, b) => b.covers.length - a.covers.length || (b.average ?? -1) - (a.average ?? -1) || a.miles - b.miles)

  async function save() {
    if (!db || !user) return
    await setDoc(doc(db, 'volunteers', user.uid), {
      uid: user.uid,
      name: user.displayName ?? 'A neighbor',
      skills,
      approxLat: roundToKm(userLocation.lat),
      approxLon: roundToKm(userLocation.lon),
      updatedAt: serverTimestamp(),
    })
    setEditing(false)
  }

  async function leave() {
    if (!db || !user) return
    await deleteDoc(doc(db, 'volunteers', user.uid))
    setEditing(false)
  }

  async function report(person: Volunteer, reason: string) {
    if (!db || !user) return
    await addDoc(collection(db, 'reports'), { reportedUid: person.uid, reportedName: person.name, reporterUid: user.uid, reason, createdAt: serverTimestamp() })
    setReported([...reported, person.uid])
    setReporting(null)
  }

  return (
    <section className="card volunteer-card" id="volunteers">
      {head}
      {loadError && <p className="empty">{loadError}</p>}
      {scored.length === 0 ? (
        <p className="empty">No volunteers listed yet. Be the first.</p>
      ) : (
        <ul className="rows">
          {scored.map((person) => (
            <li key={person.uid} className="vol-row">
              <div className="vol-main">
                <span className="row-name">{person.name}{person.uid === user.uid && ' (you)'}</span>
                {person.test && <span className="chip unknown" title="Sample listing for testing, not a real person">Test</span>}
                {person.average != null ? (
                  <span className="chip open">★ {person.average.toFixed(1)} · {person.count} {person.count === 1 ? 'rating' : 'ratings'}</span>
                ) : (
                  <span className="chip unknown">New</span>
                )}
                {person.covers.length > 0 && (
                  <span className="chip open" title={`Can help with: ${person.covers.map((item) => item.label).join(', ')}`}>
                    Matches your list ({person.covers.length})
                  </span>
                )}
                <span className="row-meta">
                  {person.miles.toFixed(1)} mi{person.skills.length > 0 && ` · ${person.skills.join(', ')}`}
                </span>
              </div>
              {person.uid === user.uid ? null : reported.includes(person.uid) ? (
                <span className="muted small">Reported for review</span>
              ) : reporting === person.uid ? (
                <select aria-label={`Reason for reporting ${person.name}`} defaultValue="" onChange={(event) => event.target.value && report(person, event.target.value)}>
                  <option value="" disabled>Why?</option>
                  {REPORT_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
              ) : (
                <button className="linkish" onClick={() => setReporting(person.uid)}>Report</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="ready-foot">
        {editing ? (
          <div className="vol-form">
            <p className="small">What can you help with? Neighbors see your first name, skills and your area (to within about half a mile).</p>
            <div className="skill-picks">
              {SKILLS.map((skill) => (
                <label key={skill} className="skill-pick">
                  <input type="checkbox" checked={skills.includes(skill)} onChange={() => setSkills(skills.includes(skill) ? skills.filter((item) => item !== skill) : [...skills, skill])} />
                  {skill}
                </label>
              ))}
            </div>
            <div className="community-actions">
              <button className="btn primary" onClick={save}>{me ? 'Save' : 'List me as a volunteer'}</button>
              {me && <button className="linkish" onClick={leave}>Stop volunteering</button>}
              <button className="linkish" onClick={() => setEditing(false)}>Cancel</button>
            </div>
            <p className="muted small">Volunteers are signed-in Google accounts. ID verification isn't available yet; check ratings before accepting a ride.</p>
          </div>
        ) : (
          <button className="btn" onClick={() => setEditing(true)}>{me ? 'Edit my volunteer listing' : 'Become a volunteer'}</button>
        )}
      </div>
    </section>
  )
}
