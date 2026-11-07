// Map (Role 3). OpenStreetMap tiles, the smooth snowfall layer from /api/risk, help pins, you, and the selected spot.
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { Place, Resource, RiskGrid } from '../types'
import SnowLayer, { SNOW_STOPS } from './SnowLayer'

// The eight Western New York counties; matches BOUNDS in backend/app/services/snowModel.py
const WNY_BOUNDS: LatLngBoundsExpression = [[41.99, -79.8], [43.4, -77.7]]

const LEGEND_STOPS = SNOW_STOPS.slice(1)
const LEGEND_GRADIENT = `linear-gradient(to right, ${LEGEND_STOPS.map(([, [red, green, blue]]) => `rgb(${red} ${green} ${blue})`).join(', ')})`

const PIN_COLOR: Record<Resource['type'], string> = {
  warming_center: '#0d9488',
  shelter: '#0d9488',
  police: '#1d4ed8',
  government: '#1d4ed8',
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
  onPick: (place: Place) => void
}

export default function MapView({ grid, resources, userLocation, selected, onPick }: Props) {
  return (
    <div className="map-wrap">
      <MapContainer bounds={WNY_BOUNDS} className="map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <SnowLayer grid={grid} />
        {resources.map((resource) => (
          <CircleMarker
            key={resource.id}
            center={[resource.lat, resource.lon]}
            radius={7}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: PIN_COLOR[resource.type], fillOpacity: 1 }}
            eventHandlers={{ click: () => onPick({ name: resource.name, lat: resource.lat, lon: resource.lon }) }}
          >
            <Tooltip>{resource.name}{resource.sample ? ' (sample)' : ''}</Tooltip>
          </CircleMarker>
        ))}
        <CircleMarker center={[userLocation.lat, userLocation.lon]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#14212b', fillOpacity: 1 }}>
          <Tooltip>You</Tooltip>
        </CircleMarker>
        {selected && <CircleMarker center={[selected.lat, selected.lon]} radius={14} pathOptions={{ color: '#14212b', weight: 2, fill: false }} />}
        <ClickToSelect onPick={onPick} />
      </MapContainer>
      <div className="snow-legend" role="img" aria-label="Storm total snowfall, from 1 inch (light blue) to 36 or more inches (dark purple)">
        <span className="snow-legend-bar" style={{ background: LEGEND_GRADIENT }} />
        <span className="snow-legend-labels">
          {LEGEND_STOPS.map(([inches], index) => (
            <span key={inches}>{index === LEGEND_STOPS.length - 1 ? `${inches}+` : inches}</span>
          ))}
        </span>
        <span className="snow-legend-unit">inches of snow</span>
      </div>
    </div>
  )
}
