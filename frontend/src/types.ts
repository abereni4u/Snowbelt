// Shapes returned by the backend. Examples for each live in shared/contracts/.

export type Level = 'low' | 'med' | 'high'
export type DataMode = 'live' | 'replay'
export type HelpKind = 'stuck' | 'no_heat' | 'medical' | 'supplies' | 'check_on_me'

export interface Place {
  name: string
  lat: number
  lon: number
}

export interface Conditions {
  snow_total_in: number
  rate_in_hr: number
  next_6h_in: number
  level: Level
  risk: number
  nearest_town?: string
}

export interface RiskGrid extends GeoJSON.FeatureCollection<GeoJSON.Polygon, Conditions> {
  wind: { from_deg: number; mph: number }
  source: string
}

export interface AreaRow extends Conditions {
  town: string
  lat: number
  lon: number
}

export interface Resource {
  id: string
  type: 'warming_center' | 'shelter' | 'police' | 'government'
  name: string
  lat: number
  lon: number
  hours: string
  phone: string
  source_url: string
  sample: boolean
  distance_mi: number
}

export interface NwsAlert {
  event: string
  headline: string
  severity: string
  ends: string | null
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface HelpDraft {
  kind: HelpKind
  note: string
}

export interface ChatReply {
  reply: string
  tool_calls: ToolCall[]
  help_draft: HelpDraft | null
}

export interface Contact {
  name: string
  email: string
  phone: string
}

export interface NotifyResult {
  channel: 'email' | 'sms'
  to: string
  status: 'sent' | 'dry_run' | 'failed'
}

export const LEVEL_LABEL: Record<Level, string> = { low: 'Low', med: 'Moderate', high: 'High' }

export const HELP_KIND_LABEL: Record<HelpKind, string> = {
  stuck: "Snowed in, can't get out",
  no_heat: 'No heat or power',
  medical: 'Need medical supplies or help',
  supplies: 'Need food or supplies',
  check_on_me: 'Please check on me',
}
