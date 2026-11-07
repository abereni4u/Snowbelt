// "Areas with high risk" list (Role 3). Shows towns above low risk, worst first.
import { LEVEL_LABEL, type AreaRow } from '../types'

interface Props {
  areas: AreaRow[]
  hoursAhead: number
  onPick: (row: AreaRow) => void
}

export default function RiskList({ areas, hoursAhead, onPick }: Props) {
  const atRisk = areas.filter((row) => row.level !== 'low')
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
          {atRisk.map((row) => (
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
    </section>
  )
}
