// "Nearest shelters & community centers" list (Role 3 layout, data from Role 4's /api/resources).
// Status comes only from the listing's own hours; we never mark a place open without them.
import type { Place, Resource } from '../types'

const SHELTER_TYPES: Resource['type'][] = ['warming_center', 'shelter', 'government']

const TYPE_LABEL: Record<Resource['type'], string> = {
  warming_center: 'Warming center',
  shelter: 'Shelter',
  police: 'Police',
  government: 'Community center',
}

export function status(resource: Resource): { label: string; open: boolean } {
  const hours = resource.hours.trim()
  if (/24\s*(\/\s*7|hours|hrs)/i.test(hours)) return { label: 'Open', open: true }
  if (hours) return { label: hours, open: false }
  return { label: 'Call ahead', open: false }
}

interface Props {
  resources: Resource[]
  onPick: (place: Place) => void
}

export default function ShelterList({ resources, onPick }: Props) {
  const nearest = resources.filter((resource) => SHELTER_TYPES.includes(resource.type)).slice(0, 5)
  const anySample = nearest.some((resource) => resource.sample)
  return (
    <section className="card shelter-card">
      <div className="card-head">
        <h2>Nearest shelters &amp; community centers</h2>
      </div>
      {nearest.length === 0 ? (
        <p className="empty">No shelters or warming centers listed nearby.</p>
      ) : (
        <ul className="rows">
          {nearest.map((resource) => {
            const { label, open } = status(resource)
            return (
              <li key={resource.id}>
                <button className="row shelter-row" onClick={() => onPick({ name: resource.name, lat: resource.lat, lon: resource.lon })}>
                  <span className="row-name">{resource.name}</span>
                  <span className="shelter-dist mono muted">{resource.distance_mi.toFixed(1)} mi</span>
                  <span className={`chip ${open ? 'open' : 'unknown'}`}>{label}</span>
                  <span className="row-meta">
                    {TYPE_LABEL[resource.type]}
                    {resource.phone && ` · ${resource.phone}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="shelter-note">
        {anySample && 'Sample listings; call ahead before you go. '}
        In an emergency, call 911 first.
      </p>
    </section>
  )
}
