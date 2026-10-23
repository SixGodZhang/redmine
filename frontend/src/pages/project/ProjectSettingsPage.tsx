import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, type Project } from '../../lib/api'
import { Button, Spinner } from '../../components/ui'

type Item = { id: number; name: string; enabled: boolean; for_all?: boolean }
type Config = {
  trackers: Item[]
  statuses: Item[]
  priorities: Item[]
  custom_fields: Item[]
  workflow_custom: boolean
}
type Workflow = {
  roles: Array<{ id: number; name: string }>
  trackers: Array<{ id: number; name: string }>
  tracker_id: number
  role_id: number
  statuses: Array<{ id: number; name: string }>
  transitions: Array<{ from: number; to: number }>
}

export function ProjectSettingsPage() {
  const { project } = useOutletContext<{ project: Project }>()
  const [config, setConfig] = useState<Config | null>(null)
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [roleId, setRoleId] = useState('')
  const [trackerId, setTrackerId] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function load() {
    return api<Config>(`/studio/projects/${project.id}/configuration`).then((res) => {
      setConfig(res)
      return res
    })
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message))
  }, [project.id])

  useEffect(() => {
    if (!config?.workflow_custom) {
      setWorkflow(null)
      return
    }
    const qs = new URLSearchParams()
    if (roleId) qs.set('role_id', roleId)
    if (trackerId) qs.set('tracker_id', trackerId)
    void api<Workflow>(`/studio/projects/${project.id}/workflow?${qs}`).then((res) => {
      setWorkflow(res)
      setRoleId(String(res.role_id))
      setTrackerId(String(res.tracker_id))
      setChecked(new Set(res.transitions.map((row) => `${row.from}-${row.to}`)))
    }).catch((err: Error) => setError(err.message))
  }, [config?.workflow_custom, project.id, roleId, trackerId])

  function toggle(list: keyof Pick<Config, 'trackers' | 'statuses' | 'priorities' | 'custom_fields'>, id: number) {
    setConfig((current) => {
      if (!current) return current
      return {
        ...current,
        [list]: current[list].map((item) => (item.id === id && !item.for_all ? { ...item, enabled: !item.enabled } : item)),
      }
    })
  }

  async function save() {
    if (!config) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await api<Config>(`/studio/projects/${project.id}/configuration`, {
        method: 'PATCH',
        body: {
          tracker_ids: config.trackers.filter((item) => item.enabled).map((item) => item.id),
          status_ids: config.statuses.filter((item) => item.enabled).map((item) => item.id),
          priority_ids: config.priorities.filter((item) => item.enabled).map((item) => item.id),
          custom_field_ids: config.custom_fields.filter((item) => item.enabled && !item.for_all).map((item) => item.id),
          workflow_custom: config.workflow_custom,
        },
      })
      setConfig(res)
      setMessage('已保存。这个项目的工单会按这里的跟踪标签、状态、优先级和字段显示。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function saveWorkflow() {
    if (!workflow) return
    setSaving(true)
    setError(null)
    try {
      const transitions = [...checked].map((key) => {
        const [from, to] = key.split('-').map(Number)
        return { from, to }
      })
      await api(`/studio/projects/${project.id}/workflow`, {
        method: 'PATCH',
        body: { tracker_id: trackerId, role_id: roleId, transitions },
      })
      setMessage('本项目的工作流已保存。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!config) return <Spinner />

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">这里的选择只影响「{project.name}」。其他项目继续用自己的配置；还没单独保存过的项目，默认使用全部。</p>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p> : null}
      <CheckSection title="跟踪标签" items={config.trackers} onToggle={(id) => toggle('trackers', id)} />
      <CheckSection title="工单状态" items={config.statuses} onToggle={(id) => toggle('statuses', id)} />
      <CheckSection title="枚举 · 优先级" items={config.priorities} onToggle={(id) => toggle('priorities', id)} />
      <CheckSection title="自定义字段" items={config.custom_fields} onToggle={(id) => toggle('custom_fields', id)} />
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <input
            type="checkbox"
            checked={config.workflow_custom}
            onChange={(e) => setConfig({ ...config, workflow_custom: e.target.checked })}
          />
          本项目使用独立工作流
        </label>
        <p className="mt-1 text-xs text-gray-500">不勾选时沿用全局工作流。勾选并保存后，可以按本项目启用的状态单独改流转。</p>
        {config.workflow_custom && workflow ? (
          <div className="mt-4">
            <div className="mb-3 flex gap-2">
              <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {workflow.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={trackerId} onChange={(e) => setTrackerId(e.target.value)}>
                {workflow.trackers.map((tracker) => <option key={tracker.id} value={tracker.id}>{tracker.name}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-gray-400">从 \ 到</th>
                    {workflow.statuses.map((status) => <th key={status.id} className="px-2 py-1 font-medium text-gray-600">{status.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {workflow.statuses.map((from) => (
                    <tr key={from.id}>
                      <th className="px-2 py-1 font-medium text-gray-600">{from.name}</th>
                      {workflow.statuses.map((to) => {
                        const key = `${from.id}-${to.id}`
                        return (
                          <td key={to.id} className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={checked.has(key)}
                              onChange={() => {
                                setChecked((current) => {
                                  const next = new Set(current)
                                  if (next.has(key)) next.delete(key)
                                  else next.add(key)
                                  return next
                                })
                              }}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="mt-3" disabled={saving} onClick={() => void saveWorkflow()}>{saving ? '保存中…' : '保存工作流'}</Button>
          </div>
        ) : null}
      </section>
      <Button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存项目配置'}</Button>
    </div>
  )
}

function CheckSection({ title, items, onToggle }: { title: string; items: Item[]; onToggle: (id: number) => void }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <label key={item.id} className={item.for_all ? 'text-sm text-gray-400' : 'text-sm text-gray-700'}>
            <input type="checkbox" className="mr-1" checked={item.enabled} disabled={item.for_all} onChange={() => onToggle(item.id)} />
            {item.name}
            {item.for_all ? '（所有项目）' : ''}
          </label>
        ))}
      </div>
    </section>
  )
}
