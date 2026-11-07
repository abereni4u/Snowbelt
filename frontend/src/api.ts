// One place for every backend call, so the URLs and shapes stay in sync with shared/contracts/.
import type {
  AreaRow, ChatMessage, ChatReply, Conditions, Contact, DataMode, HelpKind, NotifyResult, NwsAlert, Resource, RiskGrid,
} from './types'

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(BASE + path, init)
  if (!response.ok) {
    let detail = response.statusText
    try {
      detail = (await response.json()).detail ?? detail
    } catch {
      // body wasn't JSON; keep the status text
    }
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

const postJson = (body: unknown, token?: string): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
})

export const api = {
  risk: (hoursAhead: number, mode: DataMode) =>
    request<RiskGrid>(`/api/risk?hours_ahead=${hoursAhead}&mode=${mode}`),

  conditions: (lat: number, lon: number, hoursAhead: number, mode: DataMode) =>
    request<Conditions>(`/api/conditions?lat=${lat}&lon=${lon}&hours_ahead=${hoursAhead}&mode=${mode}`),

  areas: (hoursAhead: number, mode: DataMode) =>
    request<AreaRow[]>(`/api/areas?hours_ahead=${hoursAhead}&mode=${mode}`),

  resources: (lat: number, lon: number) => request<Resource[]>(`/api/resources?lat=${lat}&lon=${lon}&limit=50`),

  alerts: () => request<NwsAlert[]>('/api/alerts'),

  chat: (messages: ChatMessage[], lat: number | null, lon: number | null, hoursAhead: number, mode: DataMode) =>
    request<ChatReply>('/api/chat', postJson({ messages, lat, lon, hours_ahead: hoursAhead, mode })),

  notify: (
    body: { kind: HelpKind; note: string; lat: number; lon: number; display_name: string; contacts: Contact[] },
    token: string,
  ) => request<{ results: NotifyResult[] }>('/api/help/notify', postJson(body, token)),
}
