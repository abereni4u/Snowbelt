// Risk-aware routing (Role 3 layout, routes from Role 2's /api/route). Compares the fastest route
// with a safer one around high-risk snow; the map draws whichever plan is shown here.
import { useEffect, useState } from 'react'
import { api } from '../api'
import { LEVEL_LABEL, type AreaRow, type DataMode, type Place, type Resource, type RouteOption, type RoutePlan } from '../types'

interface Props {
  origin: Place
  resources: Resource[]
  areas: AreaRow[]
  hoursAhead: number
  dataMode: DataMode
  onPlan: (plan: RoutePlan | null) => void
}

function RouteCard({ title, option, best }: { title: string; option: RouteOption; best: boolean }) {
  const crossings = option.red_stretches.length
  return (
    <div className={`route-option ${best ? 'best' : ''}`}>
      <div className="row-between">
        <span className="route-title"><span className={`route-swatch ${title.toLowerCase()}`} />{title}</span>
        <span className={`chip ${option.level}`}>{LEVEL_LABEL[option.level]} risk</span>
      </div>
      <b className="route-time">{option.minutes} min</b>
      <span className="muted mono">{option.miles} mi</span>
      <span className="small">
        {crossings === 0 ? 'Avoids high-risk snow' : `Crosses high-risk snow ${crossings === 1 ? 'once' : `${crossings} times`}`}
      </span>
    </div>
  )
}

export default function RoutePanel({ origin, resources, areas, hoursAhead, dataMode, onPlan }: Props) {
  const [destKey, setDestKey] = useState('')
  const [plan, setPlan] = useState<RoutePlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const shelters = resources.filter((resource) => resource.type !== 'police').slice(0, 8)
  const towns = [...areas].sort((a, b) => a.town.localeCompare(b.town))

  function destination(): Place | null {
    const [kind, id] = [destKey.slice(0, 2), destKey.slice(2)]
    if (kind === 'r:') {
      const resource = resources.find((item) => item.id === id)
      return resource ? { name: resource.name, lat: resource.lat, lon: resource.lon } : null
    }
    const town = areas.find((row) => row.town === id)
    return town ? { name: town.town, lat: town.lat, lon: town.lon } : null
  }
  const dest = destKey ? destination() : null

  // Re-plan when the trip or the viewed hour changes; the short wait keeps slider drags from flooding the API
  useEffect(() => {
    if (!dest) {
      setPlan(null)
      onPlan(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setBusy(true)
      api.route(origin, dest, hoursAhead, dataMode)
        .then((result) => {
          if (cancelled) return
          setPlan(result)
          onPlan(result)
          setError('')
        })
        .catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : 'Routing failed. Try again.'))
        .finally(() => !cancelled && setBusy(false))
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // dest is rebuilt each render; its coordinates are what matter
  }, [destKey, dest?.lat, dest?.lon, origin.lat, origin.lon, hoursAhead, dataMode])

  return (
    <section className="card route-card">
      <div className="card-head route-head">
        <h2>Risk-aware routing: from {origin.name} to</h2>
        <label htmlFor="route-dest" className="sr">Destination</label>
        <select id="route-dest" value={destKey} onChange={(event) => setDestKey(event.target.value)}>
          <option value="">Choose a destination</option>
          {shelters.length > 0 && (
            <optgroup label="Nearest shelters & centers">
              {shelters.map((resource) => <option key={resource.id} value={`r:${resource.id}`}>{resource.name}</option>)}
            </optgroup>
          )}
          <optgroup label="Towns">
            {towns.map((row) => <option key={row.town} value={`t:${row.town}`}>{row.town}</option>)}
          </optgroup>
        </select>
      </div>
      {!dest && <p className="empty">Pick a shelter or town to compare the fastest drive with a safer one.</p>}
      {dest && error && <p className="empty">{error}</p>}
      {dest && !error && plan && (
        <div className={`route-body ${busy ? 'busy' : ''}`}>
          <div className="route-options">
            <RouteCard title="Fastest" option={plan.fastest} best={!plan.safer} />
            {plan.safer ? (
              <RouteCard title="Safer" option={plan.safer} best />
            ) : (
              <div className="route-option muted small">
                {plan.fastest.red_stretches.length === 0 ? 'No detour needed: the fastest route stays out of high-risk snow.' : 'No safer route found around the high-risk snow.'}
              </div>
            )}
          </div>
          {plan.note && <p className="route-note">{plan.note}</p>}
          <p className="route-note">Check road conditions before you leave. Never assume a road is safe.</p>
        </div>
      )}
      {dest && !error && !plan && busy && <p className="empty">Planning routes…</p>}
    </section>
  )
}
