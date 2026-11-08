// Volunteer hub, simulated for the demo: ID-verified neighbors with ratings and reviews,
// a report button, and a sign-up that explains ID verification (nothing is collected here).
import { useState } from 'react'

const VOLUNTEERS = [
  { name: 'Jordan R.', rating: 4.9, reviews: 38, distance: 0.6, skills: ['4x4 truck', 'Groceries'], verified: true },
  { name: 'Priya K.', rating: 4.8, reviews: 22, distance: 1.1, skills: ['Snowblower', 'Welfare checks'], verified: true },
  { name: 'Marcus T.', rating: 4.6, reviews: 15, distance: 1.8, skills: ['Generator', 'Rides to shelters'], verified: true },
  { name: 'Dana L.', rating: 4.2, reviews: 4, distance: 2.4, skills: ['Shoveling'], verified: false },
]

export default function VolunteerHub() {
  const [reported, setReported] = useState<string[]>([])
  const [signingUp, setSigningUp] = useState(false)

  return (
    <section className="card volunteer-card" id="volunteers">
      <div className="card-head">
        <div className="row-between">
          <h2>Volunteer hub</h2>
          <span className="chip unknown">Demo</span>
        </div>
        <p className="sub">Neighbors who can help, ranked by rating. Emergency volunteers verify a government ID.</p>
      </div>
      <ul className="rows">
        {VOLUNTEERS.map((person) => (
          <li key={person.name} className="vol-row">
            <div className="vol-main">
              <span className="row-name">{person.name}</span>
              {person.verified ? <span className="chip open">ID verified</span> : <span className="chip unknown">Not verified</span>}
              <span className="row-meta">
                ★ {person.rating} ({person.reviews} reviews) · {person.distance} mi · {person.skills.join(', ')}
              </span>
            </div>
            {reported.includes(person.name) ? (
              <span className="muted small">Reported for review</span>
            ) : (
              <button className="linkish" onClick={() => setReported([...reported, person.name])}>Report</button>
            )}
          </li>
        ))}
      </ul>
      <div className="ready-foot">
        {signingUp ? (
          <p className="small">
            To volunteer in emergencies you'd verify a government ID with a trusted ID provider, then get rated after each
            visit like a delivery driver. Low ratings or reports remove you from the list. (Demo: nothing is collected.)
          </p>
        ) : (
          <button className="btn" onClick={() => setSigningUp(true)}>Become a volunteer</button>
        )}
      </div>
    </section>
  )
}
