// Map (Role 3). OpenStreetMap tiles, the smooth snowfall layer from /api/risk, help pins, you, and the selected spot.
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import { divIcon, type LatLngBoundsExpression, type Map as LeafletMap } from 'leaflet'
import { useState } from 'react'
import type { Place, Resource, RiskGrid, RoutePlan } from '../types'
import SnowLayer, { SNOW_STOPS, valueAt } from './SnowLayer'
import { status } from './ShelterList'

// The eight Western New York counties; matches BOUNDS in backend/app/services/snowModel.py
const WNY_BOUNDS: LatLngBoundsExpression = [[41.99, -79.8], [43.4, -77.7]]

// Stepped legend: one solid block per snowfall band, matching the map
const LEGEND_STOPS = SNOW_STOPS
const LEGEND_GRADIENT = `linear-gradient(to right, ${LEGEND_STOPS.map(([, [red, green, blue]], index) =>
  `rgb(${red} ${green} ${blue}) ${(index / LEGEND_STOPS.length) * 100}% ${((index + 1) / LEGEND_STOPS.length) * 100}%`).join(', ')})`

const PIN_COLOR: Record<Resource['type'], string> = {
  warming_center: '#f28c28',
  shelter: '#3fbf8f',
  police: '#5b8def',
  government: '#ffffff',
}

// The white town-hall badge needs a dark glyph to stay readable
const GLYPH_COLOR: Record<Resource['type'], string> = {
  warming_center: '#ffffff',
  shelter: '#ffffff',
  police: '#ffffff',
  government: '#0a1424',
}

// Inline SVG glyphs (24x24, white strokes) so each pin shows what kind of place it is
const PIN_GLYPH: Record<Resource['type'], string> = {
  warming_center: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.3-4.8.3 1.6 1.2 2.6 2.2 2.8C11 8.5 11 6 12 3z"/>',
  shelter: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10.5 19v-5h3v5"/>',
  police: '<path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6z"/><path d="m12 8.5 1.1 2.2 2.4.3-1.75 1.7.4 2.4L12 14l-2.15 1.1.4-2.4-1.75-1.7 2.4-.3z"/>',
  government: '<path d="M4 9.5 12 5l8 4.5"/><path d="M4 20h16"/><path d="M6.5 11v7M10 11v7M14 11v7M17.5 11v7"/>',
}

const PIN_LABEL: Record<Resource['type'], string> = {
  warming_center: 'Warming center',
  shelter: 'Shelter',
  police: 'Police station',
  government: 'Government / town hall',
}

const glyphSvg = (type: Resource['type'], size: number) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${GLYPH_COLOR[type]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PIN_GLYPH[type]}</svg>`

const PIN_ICON = Object.fromEntries(
  (Object.keys(PIN_GLYPH) as Resource['type'][]).map((type) => [
    type,
    divIcon({
      className: 'resource-pin',
      html: `<span class="resource-pin-badge" style="background:${PIN_COLOR[type]}">${glyphSvg(type, 16)}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      tooltipAnchor: [14, 0],
    }),
  ]),
) as Record<Resource['type'], ReturnType<typeof divIcon>>

const toLatLng = (points: [number, number][]): [number, number][] => points.map(([lon, lat]) => [lat, lon])

function siteLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Details for one pin, shown on hover (tooltip) and on click (popup, so links can be tapped).
// Rows only appear when the listing has that field; nothing is filled in by guesswork.
function ResourceCard({ resource }: { resource: Resource }) {
  const { label, open } = status(resource)
  const website = resource.website || resource.source_url
  const hasContact = Boolean(resource.phone || resource.address || website)
  return (
    <div className="pin-card">
      <div className="pin-card-head">
        <span className="resource-pin-badge" style={{ background: PIN_COLOR[resource.type] }} dangerouslySetInnerHTML={{ __html: glyphSvg(resource.type, 13) }} />
        <span className="pin-card-type">{PIN_LABEL[resource.type]}</span>
        {resource.sample && <span className="chip unknown">Sample</span>}
      </div>
      <b className="pin-card-name">{resource.name}</b>
      <dl>
        <dt>Distance</dt>
        <dd className="mono">{(resource.distance_mi * 1.609344).toFixed(1)} km away</dd>
        <dt>Status</dt>
        <dd><span className={`chip ${open ? 'open' : 'unknown'}`}>{label}</span></dd>
        {resource.capacity != null && (<><dt>Capacity</dt><dd>{resource.capacity} people</dd></>)}
        {resource.address && (<><dt>Address</dt><dd>{resource.address}</dd></>)}
        {resource.phone && (<><dt>Phone</dt><dd><a href={`tel:${resource.phone.replace(/[^\d+]/g, '')}`}>{resource.phone}</a></dd></>)}
        {website && (<><dt>Website</dt><dd><a href={website} target="_blank" rel="noreferrer">{siteLabel(website)}</a></dd></>)}
      </dl>
      {!hasContact && <p className="pin-card-note">Contact details not listed yet. Call 2-1-1 for shelter info.</p>}
    </div>
  )
}

// Reports the snow under the cursor so the legend can show exact numbers
function HoverReadout({ grid, onHover }: { grid: RiskGrid | null; onHover: (value: { total: number; rate: number } | null) => void }) {
  useMapEvents({
    mousemove: (event) => onHover(grid ? valueAt(grid, event.latlng.lat, event.latlng.lng) : null),
    mouseout: () => onHover(null),
  })
  return null
}

function ClickToSelect({ onPick }: { onPick: (place: Place) => void }) {
  useMapEvents({
    click: (event) => onPick({ name: 'Selected spot', lat: event.latlng.lat, lon: event.latlng.lng }),
  })
  return null
}

interface Props {
  grid: RiskGrid | null
  resources: Resource[]
  userLocation: Place
  selected: Place | null
  route: RoutePlan | null
  onPick: (place: Place) => void
  onLocate: (place: Place) => void
}

export default function MapView({ grid, resources, userLocation, selected, route, onPick, onLocate }: Props) {
  const [hover, setHover] = useState<{ total: number; rate: number } | null>(null)
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [locating, setLocating] = useState(false)

  // Ask the browser where the user is now and fly there; if that's blocked or fails, center on the "You" pin
  function locate() {
    if (!map) return
    const flyTo = (lat: number, lon: number) => map.flyTo([lat, lon], Math.max(map.getZoom(), 12), { duration: 0.8 })
    if (!navigator.geolocation) {
      flyTo(userLocation.lat, userLocation.lon)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onLocate({ name: 'Your location', lat: position.coords.latitude, lon: position.coords.longitude })
        flyTo(position.coords.latitude, position.coords.longitude)
      },
      () => {
        setLocating(false)
        flyTo(userLocation.lat, userLocation.lon)
      },
      { timeout: 8000, maximumAge: 0 },
    )
  }

  return (
    <div className="map-wrap">
      <MapContainer bounds={WNY_BOUNDS} className="map" scrollWheelZoom ref={setMap}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <SnowLayer grid={grid} />
        {route && (
          <>
            <Polyline
              positions={toLatLng(route.fastest.geometry.coordinates)}
              pathOptions={route.safer ? { color: '#9fb3cc', weight: 4, opacity: 0.8, dashArray: '6 8' } : { color: '#9fb3cc', weight: 5, opacity: 0.95 }}
            >
              <Tooltip sticky>Fastest: {route.fastest.minutes} min</Tooltip>
            </Polyline>
            {route.safer && (
              <Polyline positions={toLatLng(route.safer.geometry.coordinates)} pathOptions={{ color: '#3fbf8f', weight: 6, opacity: 0.95 }}>
                <Tooltip sticky>Safer: {route.safer.minutes} min</Tooltip>
              </Polyline>
            )}
            {[...route.fastest.red_stretches, ...(route.safer?.red_stretches ?? [])].map((stretch, index) => (
              <Polyline key={index} positions={toLatLng(stretch)} pathOptions={{ color: '#ff6b6b', weight: 6, opacity: 0.95 }} />
            ))}
          </>
        )}
        {resources.map((resource) => (
          <Marker
            key={resource.id}
            position={[resource.lat, resource.lon]}
            icon={PIN_ICON[resource.type]}
            title={PIN_LABEL[resource.type]}
            eventHandlers={{
              click: () => onPick({ name: resource.name, lat: resource.lat, lon: resource.lon }),
              // Hide the hover copy while the clicked popup is showing the same card
              popupopen: (event) => event.target.getTooltip()?.setOpacity(0),
              popupclose: (event) => event.target.getTooltip()?.setOpacity(1),
            }}
          >
            <Tooltip direction="auto" className="pin-tip" opacity={1}>
              <ResourceCard resource={resource} />
            </Tooltip>
            <Popup className="pin-popup" closeButton={false} offset={[0, -10]}>
              <ResourceCard resource={resource} />
            </Popup>
          </Marker>
        ))}
        <CircleMarker center={[userLocation.lat, userLocation.lon]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2f8fd8', fillOpacity: 1 }}>
          <Tooltip>You</Tooltip>
        </CircleMarker>
        {selected && <CircleMarker center={[selected.lat, selected.lon]} radius={14} pathOptions={{ color: '#8fd0ff', weight: 2, fill: false, dashArray: '4 4' }} />}
        <ClickToSelect onPick={onPick} />
        <HoverReadout grid={grid} onHover={setHover} />
      </MapContainer>
      <button
        type="button"
        className={`locate-btn${locating ? ' locating' : ''}`}
        onClick={locate}
        title="Center the map on my current location"
        aria-label="Center the map on my current location"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
      <div className="snow-legend" role="img" aria-label="Storm total snowfall bands: 1-3, 3-6, 6-12, 12-24, 24-36 and 36 or more inches, light blue to dark purple">
        <span className="snow-legend-bar" style={{ background: LEGEND_GRADIENT }} />
        <span className="snow-legend-labels">
          {LEGEND_STOPS.map(([inches], index) => (
            <span key={inches}>{index === LEGEND_STOPS.length - 1 ? `${inches}+` : inches}</span>
          ))}
        </span>
        <span className="snow-legend-unit">
          {hover ? <>Here: <b className="mono">{hover.total.toFixed(1)} in</b> · {hover.rate.toFixed(1)} in/hr</> : 'inches of snow · hover for exact'}
        </span>
      </div>
      <ul className="pin-legend" aria-label="Map pin types">
        {(Object.keys(PIN_GLYPH) as Resource['type'][]).map((type) => (
          <li key={type}>
            <span className="resource-pin-badge" style={{ background: PIN_COLOR[type] }} dangerouslySetInnerHTML={{ __html: glyphSvg(type, 13) }} />
            {PIN_LABEL[type]}
          </li>
        ))}
      </ul>
    </div>
  )
}
