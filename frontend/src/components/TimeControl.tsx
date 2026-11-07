// Live / Future switch, hour slider, play button, and the 2022 replay toggle (Role 3).
import { useEffect, useRef, useState } from 'react'
import type { DataMode } from '../types'

interface Props {
  hoursAhead: number
  onHoursChange: (hours: number) => void
  dataMode: DataMode
  onDataModeChange: (mode: DataMode) => void
}

export default function TimeControl({ hoursAhead, onHoursChange, dataMode, onDataModeChange }: Props) {
  const [future, setFuture] = useState(false)
  const [playing, setPlaying] = useState(false)
  const hoursRef = useRef(hoursAhead)
  hoursRef.current = hoursAhead

  // Play steps through the next 24 hours, one hour every 400 ms
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const next = hoursRef.current + 1
      if (next > 24) {
        setPlaying(false)
        return
      }
      onHoursChange(next)
    }, 400)
    return () => window.clearInterval(timer)
  }, [playing, onHoursChange])

  const goLive = () => {
    setPlaying(false)
    setFuture(false)
    onHoursChange(0)
  }
  const goFuture = () => {
    setFuture(true)
    if (hoursAhead === 0) onHoursChange(6)
  }

  return (
    <div className="time-control">
      <div className="seg" role="group" aria-label="Map time">
        <button aria-pressed={!future} onClick={goLive}>{dataMode === 'replay' ? 'Replay' : 'Live'}</button>
        <button aria-pressed={future} onClick={goFuture}>Future</button>
      </div>
      {future && (
        <div className="future">
          <button
            className="btn round"
            aria-label={playing ? 'Pause' : 'Play the next 24 hours'}
            onClick={() => {
              if (!playing && hoursAhead >= 24) onHoursChange(0)
              setPlaying(!playing)
            }}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <label className="slider">
            <span className="sr">Hours ahead</span>
            <input type="range" min={0} max={24} value={hoursAhead} onChange={(event) => onHoursChange(Number(event.target.value))} />
            <span className="slider-value">+{hoursAhead} h</span>
          </label>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={dataMode === 'replay'} onChange={(event) => onDataModeChange(event.target.checked ? 'replay' : 'live')} />
        Replay Nov 2022 storm
      </label>
    </div>
  )
}
