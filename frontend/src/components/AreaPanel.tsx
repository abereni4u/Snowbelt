// Conditions for the selected place or the user's location (Role 3).
// TODO(Role 3): swap the number tiles for the two dial gauges from docs/ui-prototype.html.
import { useEffect, useState } from 'react'
import { api } from '../api'
import { LEVEL_LABEL, type Conditions, type DataMode, type Place } from '../types'

interface Props {
  place: Place
  isUser: boolean
  hoursAhead: number
  dataMode: DataMode
  onReset: () => void
}

export default function AreaPanel({ place, isUser, hoursAhead, dataMode, onReset }: Props) {
  const [conditions, setConditions] = useState<Conditions | null>(null)

  useEffect(() => {
    api.conditions(place.lat, place.lon, hoursAhead, dataMode).then(setConditions).catch(() => setConditions(null))
  }, [place, hoursAhead, dataMode])

  const title = place.name === 'Selected spot' && conditions?.nearest_town ? `Near ${conditions.nearest_town}` : place.name

  return (
    <section className="card area-card">
      <div className="area-head">
        <div>
          <div className="eyebrow">{isUser ? 'Your location' : 'Selected'}</div>
          <h2 className="area-name">{title}</h2>
        </div>
        {conditions && <span className={`chip ${conditions.level}`}>{LEVEL_LABEL[conditions.level]} risk</span>}
      </div>
      {!isUser && (
        <button className="linkish" onClick={onReset}>Back to my location</button>
      )}
      {conditions && (
        <div className="stats">
          <div className="stat"><span className="stat-label">Snow accumulation</span><b>{conditions.snow_total_in}</b><span className="unit">inches</span></div>
          <div className="stat"><span className="stat-label">Snow rate</span><b>{conditions.rate_in_hr.toFixed(1)}</b><span className="unit">in per hour</span></div>
          <div className="stat"><span className="stat-label">Next 6 hours</span><b>+{conditions.next_6h_in}</b><span className="unit">inches</span></div>
        </div>
      )}
    </section>
  )
}
