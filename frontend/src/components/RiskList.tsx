// "Areas with high risk" list (Role 3). Shows towns above low risk, worst first (top few, then "Show all").
import { useState } from 'react'
import { LEVEL_LABEL, type AreaRow } from '../types'

const SHOW_FIRST = 6

interface Props {
  areas: AreaRow[]
  hoursAhead: number
  onPick: (row: AreaRow) => void
}

export default function RiskList({ areas, hoursAhead, onPick }: Props) {
  const [showAll, setShowAll] = useState(false)
  const atRisk = areas.filter((row) => row.level !== 'low')
  const shown = showAll ? atRisk : atRisk.slice(0, SHOW_FIRST)
  return (
    <section className="card list-card">
      <div className="card-head row-between">
        <h2>Areas with high risk</h2>
        <span className="muted mono">{hoursAhead === 0 ? 'Currently' : `+${hoursAhead} h`}</span>
      </div>
      {atRisk.length === 0 ? (
        <p className="empty">No towns above low risk right now.</p>
      ) : (
        <ul className="rows">
          {shown.map((row) => (
            <li key={row.town}>
              <button className="row" onClick={() => onPick(row)}>
                <span className="row-name">{row.town}</span>
                <span className="row-meta">{row.snow_total_in} in so far · {row.rate_in_hr.toFixed(1)} in/hr</span>
                <span className={`chip ${row.level}`}>{LEVEL_LABEL[row.level]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {atRisk.length > SHOW_FIRST && (
        <div className="list-more">
          <button className="linkish" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${atRisk.length} towns`}</button>
        </div>
      )}
    </section>
  )
}
