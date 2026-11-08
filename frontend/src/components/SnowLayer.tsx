// Snowfall layer (Role 3). Draws the /api/risk grid as NWS-style snowfall bands (1-3", 3-6", ...):
// a sharp outline on every band edge with only a light fill, so roads and town names stay readable.
// It is redrawn for the current view after every pan or zoom (one canvas the size of the map),
// so edges stay smooth at any zoom instead of turning into stretched pixels.
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { DomUtil, Layer, type Map as LeafletMap } from 'leaflet'
import type { RiskGrid } from '../types'

type Rgb = [number, number, number]

// [band starts at (inches), color, fill opacity]. Below the first band the map stays clear.
export const SNOW_STOPS: [number, Rgb, number][] = [
  [1, [125, 190, 255], 0.06],
  [3, [74, 150, 240], 0.12],
  [6, [50, 105, 230], 0.2],
  [12, [128, 76, 214], 0.24],
  [24, [190, 60, 170], 0.28],
  [36, [235, 70, 120], 0.32],
]
const EDGE_ALPHA = 0.95

function bandFor(inches: number): number {
  let band = -1
  for (let index = 0; index < SNOW_STOPS.length; index++) {
    if (inches >= SNOW_STOPS[index][0]) band = index
  }
  return band
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

// Grid geometry: cell centers sit half a cell in from the outer bounds
function cellPosition(grid: RiskGrid, lat: number, lon: number) {
  const latStep = (grid.bounds.north - grid.bounds.south) / grid.rows
  const lonStep = (grid.bounds.east - grid.bounds.west) / grid.cols
  return { gridY: (lat - grid.bounds.south) / latStep - 0.5, gridX: (lon - grid.bounds.west) / lonStep - 0.5 }
}

function sample(values: number[][], grid: RiskGrid, gridX: number, gridY: number): number {
  const x = clamp(gridX, 0, grid.cols - 1)
  const y = clamp(gridY, 0, grid.rows - 1)
  const col0 = Math.floor(x)
  const row0 = Math.floor(y)
  const col1 = Math.min(col0 + 1, grid.cols - 1)
  const row1 = Math.min(row0 + 1, grid.rows - 1)
  const tx = x - col0
  const ty = y - row0
  const south = values[row0][col0] * (1 - tx) + values[row0][col1] * tx
  const north = values[row1][col0] * (1 - tx) + values[row1][col1] * tx
  return south * (1 - ty) + north * ty
}

/** Storm total and rate at a point, blended from the grid; null outside the grid. */
export function valueAt(grid: RiskGrid, lat: number, lon: number): { total: number; rate: number } | null {
  const { bounds } = grid
  if (lat < bounds.south || lat > bounds.north || lon < bounds.west || lon > bounds.east) return null
  const { gridX, gridY } = cellPosition(grid, lat, lon)
  return { total: sample(grid.snow_total_in, grid, gridX, gridY), rate: sample(grid.rate_in_hr, grid, gridX, gridY) }
}

class SnowCanvas extends Layer {
  private grid: RiskGrid | null = null
  private canvas: HTMLCanvasElement | null = null

  setGrid(grid: RiskGrid | null) {
    this.grid = grid
    this.redraw()
  }

  onAdd(map: LeafletMap) {
    this.canvas = DomUtil.create('canvas', 'snow-layer leaflet-zoom-hide') as HTMLCanvasElement
    map.getPanes().overlayPane.appendChild(this.canvas)
    map.on('moveend zoomend resize', this.redraw, this)
    this.redraw()
    return this
  }

  onRemove(map: LeafletMap) {
    map.off('moveend zoomend resize', this.redraw, this)
    this.canvas?.remove()
    this.canvas = null
    return this
  }

  redraw() {
    const map = this._map
    const canvas = this.canvas
    if (!map || !canvas) return
    const size = map.getSize()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.round(size.x * ratio)
    const height = Math.round(size.y * ratio)
    canvas.width = width
    canvas.height = height
    canvas.style.width = `${size.x}px`
    canvas.style.height = `${size.y}px`
    DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))
    const context = canvas.getContext('2d')
    const grid = this.grid
    if (!context || !grid) return

    // On a web-mercator map longitude depends only on x and latitude only on y
    const gridXs = new Float64Array(width)
    for (let x = 0; x < width; x++) gridXs[x] = cellPosition(grid, 0, map.containerPointToLatLng([(x + 0.5) / ratio, 0]).lng).gridX
    const gridYs = new Float64Array(height)
    for (let y = 0; y < height; y++) gridYs[y] = cellPosition(grid, map.containerPointToLatLng([0, (y + 0.5) / ratio]).lat, 0).gridY

    const bands = new Int8Array(width * height)
    for (let y = 0; y < height; y++) {
      const gridY = gridYs[y]
      const outsideY = gridY < -0.5 || gridY > grid.rows - 0.5
      for (let x = 0; x < width; x++) {
        const gridX = gridXs[x]
        bands[y * width + x] = outsideY || gridX < -0.5 || gridX > grid.cols - 0.5 ? -1 : bandFor(sample(grid.snow_total_in, grid, gridX, gridY))
      }
    }

    // Edge lines are about 1.5 CSS pixels wide whatever the screen density
    const reach = Math.max(1, Math.round(ratio * 0.75))
    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const band = bands[y * width + x]
        if (band < 0) continue
        let edge = false
        for (let step = 1; step <= reach && !edge; step++) {
          edge =
            (x >= step && bands[y * width + x - step] < band) || (x + step < width && bands[y * width + x + step] < band) ||
            (y >= step && bands[(y - step) * width + x] < band) || (y + step < height && bands[(y + step) * width + x] < band)
        }
        const [, [red, green, blue], fill] = SNOW_STOPS[band]
        const offset = (y * width + x) * 4
        image.data[offset] = red
        image.data[offset + 1] = green
        image.data[offset + 2] = blue
        image.data[offset + 3] = Math.round((edge ? EDGE_ALPHA : fill) * 255)
      }
    }
    context.putImageData(image, 0, 0)
  }
}

export default function SnowLayer({ grid }: { grid: RiskGrid | null }) {
  const map = useMap()
  const layer = useRef<SnowCanvas | null>(null)

  useEffect(() => {
    layer.current = new SnowCanvas().addTo(map)
    return () => {
      layer.current?.remove()
      layer.current = null
    }
  }, [map])

  useEffect(() => {
    layer.current?.setGrid(grid)
  }, [grid])

  return null
}
