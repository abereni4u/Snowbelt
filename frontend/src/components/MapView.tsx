// Map (Role 3). OpenStreetMap tiles, the snowfall grid from /api/risk, help pins, you, and the selected spot.
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import type { PathOptions } from 'leaflet'
import type { Conditions, Place, Resource, RiskGrid } from '../types'

// NWS-style snowfall colors, inches of storm total: 1, 3, 6, 12, 24, 36+
const SNOW_BINS: [number, string][] = [
  [36, '#6b1150'], [24, '#a62b8e'], [12, '#6743b4'], [6, '#4b88d6'], [3, '#93bde7'], [1, '#d3e5f6'],
]

function cellStyle(feature?: GeoJSON.Feature<GeoJSON.Geometry, Conditions>): PathOptions {
  const total = feature?.properties.snow_total_in ?? 0
  const bin = SNOW_BINS.find(([threshold]) => total >= threshold)
  return { stroke: false, fillColor: bin ? bin[1] : 'transparent', fillOpacity: bin ? 0.55 : 0 }
}

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
  gridKey: string
  resources: Resource[]
  userLocation: Place
  selected: Place | null
  onPick: (place: Place) => void
}

export default function MapView({ grid, gridKey, resources, userLocation, selected, onPick }: Props) {
  return (
    <MapContainer center={[42.86, -78.8]} zoom={10} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {/* key forces a redraw when new grid data arrives; GeoJSON doesn't watch its data prop */}
      {grid && <GeoJSON key={gridKey} data={grid} style={cellStyle} interactive={false} />}
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
  )
}
