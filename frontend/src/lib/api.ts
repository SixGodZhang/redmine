const API_KEY_STORAGE = 'redmine_api_key'

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE)
}

export function setApiKey(key: string | null) {
  if (key) localStorage.setItem(API_KEY_STORAGE, key)
  else localStorage.removeItem(API_KEY_STORAGE)
}

export class ApiError extends Error {
  status: number
  errors: string[]

  constructor(status: number, errors: string[]) {
    super(errors.join('；') || `HTTP ${status}`)
    this.status = status
    this.errors = errors
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  json?: boolean
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, json = true, headers, ...rest } = options
  const apiKey = getApiKey()
  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(apiKey ? { 'X-Redmine-API-Key': apiKey } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }

  const res = await fetch(path, init)
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }

  if (!res.ok) {
    const payload = data as { errors?: string[]; error?: string }
    const errors = payload?.errors ?? (payload?.error ? [payload.error] : [res.statusText])
    throw new ApiError(res.status, errors)
  }

  if (!json) return undefined as T
  return data as T
}

export async function fetchSession() {
  return api<{ user: User | null }>('/studio/session')
}

export async function login(username: string, password: string) {
  const data = await api<{ user: User }>('/studio/session', {
    method: 'POST',
    body: { username, password },
  })
  setApiKey(data.user.api_key)
  return data.user
}

export async function logout() {
  await api('/studio/session', { method: 'DELETE' })
  setApiKey(null)
}

export type User = {
  id: number
  login: string
  firstname: string
  lastname: string
  mail: string
  admin: boolean
  api_key: string
}

export type Issue = {
  id: number
  subject: string
  description?: string
  status: { id: number; name: string; is_closed?: boolean }
  priority: { id: number; name: string }
  tracker: { id: number; name: string }
  author: { id: number; name: string }
  assigned_to?: { id: number; name: string }
  project: { id: number; name: string }
  category?: { id: number; name: string }
  fixed_version?: { id: number; name: string }
  parent?: { id: number }
  custom_fields?: Array<{ id: number; name: string; value?: string | string[] | null }>
  created_on: string
  updated_on: string
  start_date?: string | null
  due_date?: string | null
  done_ratio?: number
  estimated_hours?: number | null
  total_estimated_hours?: number | null
  spent_hours?: number | null
  total_spent_hours?: number | null
}

export type Project = {
  id: number
  name: string
  identifier: string
  description?: string
  status: number
  created_on: string
  updated_on: string
}
