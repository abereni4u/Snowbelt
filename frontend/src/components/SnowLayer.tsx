// Smooth snowfall layer (Role 3). Turns the /api/risk grid into one image: values are blended
// between cell centers and colored on a continuous scale, so the storm reads like a radar map
// instead of a field of squares.
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { imageOverlay, latLngBounds, type ImageOverlay } from 'leaflet'
import type { RiskGrid } from '../types'

type Rgba = [number, number, number, number]

// NWS-style snowfall colors by storm total (inches). Below the first stop the map stays clear.
export const SNOW_STOPS: [number, Rgba][] = [
  [0.5, [211, 229, 246, 0]],
  [1, [211, 229, 246, 0.4]],
  [3, [147, 189, 231, 0.5]],
  [6, [75, 136, 214, 0.6]],
  [12, [103, 67, 180, 0.68]],
  [24, [166, 43, 142, 0.75]],
  [36, [107, 17, 80, 0.8]],
]

// Image pixels per grid cell; the browser smooths the rest when it stretches the image over the map
const UPSCALE = 6

function colorFor(inches: number): Rgba {
  if (inches <= SNOW_STOPS[0][0]) return SNOW_STOPS[0][1]
  for (let index = 1; index < SNOW_STOPS.length; index++) {
    const [top, topColor] = SNOW_STOPS[index]
    if (inches <= top) {
      const [bottom, bottomColor] = SNOW_STOPS[index - 1]
      const t = (inches - bottom) / (top - bottom)
      return bottomColor.map((value, channel) => value + (topColor[channel] - value) * t) as Rgba
    }
  }
  return SNOW_STOPS[SNOW_STOPS.length - 1][1]
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

function drawGrid(grid: RiskGrid): string {
  const width = grid.cols * UPSCALE
  const height = grid.rows * UPSCALE
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return ''
  const image = context.createImageData(width, height)
  const values = grid.snow_total_in
  for (let y = 0; y < height; y++) {
    // Image row 0 is the north edge; grid row 0 is the south edge
    const gridY = clamp(grid.rows - (y + 0.5) / UPSCALE - 0.5, 0, grid.rows - 1)
    const row0 = Math.floor(gridY)
    const row1 = Math.min(row0 + 1, grid.rows - 1)
    const ty = gridY - row0
    for (let x = 0; x < width; x++) {
      const gridX = clamp((x + 0.5) / UPSCALE - 0.5, 0, grid.cols - 1)
      const col0 = Math.floor(gridX)
      const col1 = Math.min(col0 + 1, grid.cols - 1)
      const tx = gridX - col0
      const south = values[row0][col0] * (1 - tx) + values[row0][col1] * tx
      const north = values[row1][col0] * (1 - tx) + values[row1][col1] * tx
      const [red, green, blue, alpha] = colorFor(south * (1 - ty) + north * ty)
      const offset = (y * width + x) * 4
      image.data[offset] = red
      image.data[offset + 1] = green
      image.data[offset + 2] = blue
      image.data[offset + 3] = Math.round(alpha * 255)
    }
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

export default function SnowLayer({ grid }: { grid: RiskGrid | null }) {
  const map = useMap()
  const overlay = useRef<ImageOverlay | null>(null)

  useEffect(() => {
    if (!grid) return
    const url = drawGrid(grid)
    const bounds = latLngBounds([grid.bounds.south, grid.bounds.west], [grid.bounds.north, grid.bounds.east])
    if (overlay.current) {
      // Swap the image in place so the layer doesn't blink while the time slider plays
      overlay.current.setUrl(url).setBounds(bounds)
    } else {
      overlay.current = imageOverlay(url, bounds, { interactive: false, className: 'snow-layer' }).addTo(map)
    }
  }, [grid, map])

  useEffect(
    () => () => {
      overlay.current?.remove()
      overlay.current = null
    },
    [map],
  )

  return null
}
