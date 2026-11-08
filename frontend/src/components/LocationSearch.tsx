// Location search under the header (Role 3). Matches a Western NY town or county and makes it
// "home" for the whole page: shelters, conditions, routes and the assistant all follow it.
import { useState } from 'react'
import type { AreaRow, Place } from '../types'

// Each county is centered on a town we already have; the label stays the county name.
const COUNTY_TOWN: Record<string, string> = {
  erie: 'Buffalo',
  niagara: 'Lockport',
  orleans: 'Albion',
  genesee: 'Batavia',
  wyoming: 'Warsaw',
  chautauqua: 'Jamestown',
  cattaraugus: 'Olean',
  allegany: 'Belmont',
}

const COUNTY_NAMES = Object.keys(COUNTY_TOWN).map((county) => `${county[0].toUpperCase()}${county.slice(1)} County`)

function findPlace(query: string, areas: AreaRow[]): Place | null {
  const text = query.toLowerCase().replace(/,?\s*(ny|new york)$/, '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const countyKey = text.replace(/\s*county$/, '')
  if (text.endsWith('county') && COUNTY_TOWN[countyKey]) {
    const seat = areas.find((row) => row.town === COUNTY_TOWN[countyKey])
    if (seat) return { name: `${countyKey[0].toUpperCase()}${countyKey.slice(1)} County`, lat: seat.lat, lon: seat.lon }
  }
  const town =
    areas.find((row) => row.town.toLowerCase() === text) ??
    areas.find((row) => row.town.toLowerCase().startsWith(text)) ??
    areas.find((row) => row.town.toLowerCase().includes(text))
  return town ? { name: town.town, lat: town.lat, lon: town.lon } : null
}

interface Props {
  areas: AreaRow[]
  onFound: (place: Place) => void
}

export default function LocationSearch({ areas, onFound }: Props) {
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')

  function submit() {
    const place = findPlace(query, areas)
    if (place) {
      onFound(place)
      setQuery('')
      setMessage('')
    } else {
      setMessage(`Couldn't find "${query.trim()}". Try a Western NY town or county, like Cheektowaga or Erie County.`)
    }
  }

  return (
    <div className="search">
      <form className="search-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <label htmlFor="place-search" className="sr">Your town or county in Western NY</label>
        <input
          id="place-search"
          list="place-options"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter your town or county in Western NY (e.g. Cheektowaga, Erie County)"
          autoComplete="off"
        />
        <datalist id="place-options">
          {[...areas.map((row) => row.town).sort(), ...COUNTY_NAMES].map((name) => <option key={name} value={name} />)}
        </datalist>
        <button className="btn primary" type="submit" disabled={!query.trim()}>Check conditions</button>
      </form>
      {message && <p className="search-msg">{message}</p>}
    </div>
  )
}
