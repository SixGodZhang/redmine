import { useEffect, useState } from 'react'
import { api, type Project } from '../lib/api'
import { Card, PageHeader, Select, Spinner } from '../components/ui'

type VersionOption = { id: number; name: string; status: string; effective_date: string | null }

type Summary = {
  total: number
  checked: number
  closed: number
  completion_rate: number | null
  checked_rate: number | null
  untouched_bugs: number
  open_bugs: number
  bug_total: number
  bug_rate: number | null
  leftover_bug_rate: number | null
  bug_fix_rate: number | null
  overdue: number
  open: number
  stale: number
  unassigned: number
}

type CountRow = { id?: number | null; name: string; count: number; ratio?: number | null }

type Report = {
  project: { id: number; name: string; identifier: string } | null
  versions: VersionOption[]
  version: VersionOption | null
  previous_version: VersionOption | null
  summary: Summary | null
  previous_summary: Summary | null
  compare: {
    total: number
    completion_rate: number | null
    bug_rate: number | null
    leftover_bug_rate: number | null
  } | null
  pipeline: Array<{ id: number; name: string; is_closed: boolean; count: number }>
  assignees: CountRow[]
  priorities: CountRow[]
  trackers: { bugs: number; others: number; items: Array<{ name: string; count: number; bug: boolean }> }
  health: Array<{ key: string; level: string; title: string; detail: string }>
  unversioned_open: number
}

function percent(value: number | null | undefined) {
  return value == null ? '—' : `${value}%`
}

function signed(value: number | null | undefined, suffix = '') {
  if (value == null) return '—'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value}${suffix}`
}

export function PmPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api<{ projects: Project[] }>('/projects.json?limit=100').then((res) => setProjects(res.projects ?? []))
  }, [])

  useEffect(() => {
    if (!projectId) {
      setReport(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ project_id: projectId })
    if (versionId) qs.set('version_id', versionId)
    void api<Report>(`/studio/pm?${qs}`)
      .then((res) => {
        if (cancelled) return
        setReport(res)
        setLoading(false)
        if (!versionId && res.version) setVersionId(String(res.version.id))
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || '统计加载失败')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, versionId])

  const summary = report?.summary

  return (
    <div className="space-y-4">
      <PageHeader title="PM" />
      <div className="flex flex-wrap gap-2">
        <Select
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value)
            setVersionId('')
            setReport(null)
          }}
          className="!w-48"
        >
          <option value="">选择项目</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        <Select
          value={versionId}
          onChange={(event) => setVersionId(event.target.value)}
          className="!w-56"
          disabled={!projectId}
        >
          <option value="">选择版本</option>
          {(report?.versions ?? []).map((version) => (
            <option key={version.id} value={version.id}>
              {version.name}
              {version.effective_date ? ` · ${version.effective_date}` : ''}
            </option>
          ))}
        </Select>
      </div>

      {!projectId ? <p className="text-sm text-gray-500">先选择项目，再看这一版的健康度。</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading && !report ? <Spinner /> : null}

      {!loading && projectId && report && !report.version ? (
        <p className="text-sm text-gray-500">这个项目还没有目标版本。到项目里建一个版本后再来看。</p>
      ) : null}

      {summary && report?.version ? (
        <>
          <div className="text-sm text-gray-500">
            {report.project?.name} · {report.version.name}
            {report.version.effective_date ? ` · 完成日期 ${report.version.effective_date}` : ' · 未设置完成日期'}
            {report.unversioned_open > 0 ? ` · 另有 ${report.unversioned_open} 张未关闭工单还没进版本` : ''}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="纳入单量" value={String(summary.total)} hint="这一版的全部工单" />
            <Metric label="查完量" value={String(summary.checked)} hint={`测试完成或已关闭 · ${percent(summary.checked_rate)}`} />
            <Metric label="完成量" value={String(summary.closed)} hint={`完成率 ${percent(summary.completion_rate)}`} />
            <Metric label="尚未处理的缺陷" value={String(summary.untouched_bugs)} hint="缺陷单仍停在新建" />
            <Metric label="未关闭缺陷" value={String(summary.open_bugs)} hint={`缺陷共 ${summary.bug_total} 张`} />
            <Metric label="缺陷率" value={percent(summary.bug_rate)} hint="缺陷单 / 纳入单量" />
            <Metric label="遗留缺陷率" value={percent(summary.leftover_bug_rate)} hint="未关闭缺陷 / 纳入单量" />
            <Metric label="缺陷修复率" value={summary.bug_total === 0 ? '无缺陷单' : percent(summary.bug_fix_rate)} hint={`逾期 ${summary.overdue} 张`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">状态流水线</h2>
              <Bars rows={(report.pipeline ?? []).map((item) => ({ name: item.name, count: item.count }))} color={rowColor} />
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">缺陷占比</h2>
              <Donut bugs={report.trackers?.bugs ?? 0} others={report.trackers?.others ?? 0} />
              <ul className="mt-3 space-y-1 text-sm text-gray-600">
                {(report.trackers?.items ?? []).map((item) => (
                  <li key={item.name} className="flex justify-between gap-3">
                    <span>{item.name}</span>
                    <span>{item.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">未关闭工单 · 指派给</h2>
              <Bars
                rows={(report.assignees ?? []).map((item) => ({
                  name: item.ratio == null ? item.name : `${item.name} · ${item.ratio}%`,
                  count: item.count,
                }))}
              />
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">未关闭工单 · 优先级</h2>
              <Bars rows={(report.priorities ?? []).map((item) => ({ name: item.name, count: item.count }))} />
            </Card>
          </div>

          {report.previous_summary && report.previous_version ? (
            <Card className="p-4">
              <h2 className="mb-1 text-sm font-semibold text-gray-900">对照上一版本</h2>
              <p className="mb-3 text-xs text-gray-500">{report.previous_version.name}</p>
              <Compare
                rows={[
                  { name: '纳入单量', current: summary.total, previous: report.previous_summary.total, delta: report.compare?.total ?? null, suffix: '' },
                  { name: '完成率', current: summary.completion_rate, previous: report.previous_summary.completion_rate, delta: report.compare?.completion_rate ?? null, suffix: '%' },
                  { name: '缺陷率', current: summary.bug_rate, previous: report.previous_summary.bug_rate, delta: report.compare?.bug_rate ?? null, suffix: '%' },
                  { name: '遗留缺陷率', current: summary.leftover_bug_rate, previous: report.previous_summary.leftover_bug_rate, delta: report.compare?.leftover_bug_rate ?? null, suffix: '%' },
                ]}
              />
            </Card>
          ) : null}

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">健康结论</h2>
            {summary.total === 0 ? <p className="text-sm text-gray-500">这个版本还没有工单，先不判断风险。</p> : null}
            <ul className="space-y-2">
              {(summary.total === 0 ? [] : report.health ?? []).map((item) => (
                <li key={item.key} className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2">
                  <Level level={item.level} />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{item.title}</div>
                    <div className="text-xs text-gray-500">{item.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-400">{hint}</div>
    </Card>
  )
}

function Bars({ rows, color }: { rows: Array<{ name: string; count: number }>; color?: (name: string) => string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400">没有数据</p>
  const max = Math.max(1, ...rows.map((row) => row.count))
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.name}>
          <div className="mb-1 flex justify-between gap-3 text-xs text-gray-600">
            <span className="truncate">{row.name}</span>
            <span>{row.count}</span>
          </div>
          <div className="h-2 rounded bg-gray-100">
            <div className={`h-2 rounded ${color ? color(row.name) : 'bg-blue-500'}`} style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function rowColor(name: string) {
  if (name === '已关闭' || name === '测试完成') return 'bg-emerald-500'
  if (name.includes('修复') || name === '新建') return 'bg-amber-500'
  return 'bg-blue-500'
}

function Donut({ bugs, others }: { bugs: number; others: number }) {
  const total = bugs + others
  if (total === 0) return <p className="text-sm text-gray-400">没有工单</p>
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const bugLength = (bugs / total) * circumference
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-28 w-28">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="16" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#ef4444"
          strokeWidth="16"
          strokeDasharray={`${bugLength} ${circumference - bugLength}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="56" textAnchor="middle" className="fill-gray-900 text-[14px] font-semibold">
          {Math.round((bugs / total) * 100)}%
        </text>
        <text x="60" y="72" textAnchor="middle" className="fill-gray-400 text-[9px]">
          缺陷
        </text>
      </svg>
      <div className="text-sm text-gray-600">
        <div>缺陷 {bugs}</div>
        <div>其他 {others}</div>
      </div>
    </div>
  )
}

function Compare({
  rows,
}: {
  rows: Array<{ name: string; current: number | null; previous: number | null; delta: number | null; suffix: string }>
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const max = Math.max(row.current ?? 0, row.previous ?? 0, 1)
        return (
          <div key={row.name}>
            <div className="mb-1 flex justify-between text-xs text-gray-600">
              <span>{row.name}</span>
              <span>较上版 {signed(row.delta, row.suffix)}</span>
            </div>
            <div className="space-y-1">
              <CompareBar label="本版" value={row.current} max={max} suffix={row.suffix} tone="bg-blue-500" />
              <CompareBar label="上版" value={row.previous} max={max} suffix={row.suffix} tone="bg-gray-300" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CompareBar({ label, value, max, suffix, tone }: { label: string; value: number | null; max: number; suffix: string; tone: string }) {
  const width = value == null ? 0 : (value / max) * 100
  return (
    <div className="grid grid-cols-[36px_1fr_64px] items-center gap-2 text-xs text-gray-500">
      <span>{label}</span>
      <div className="h-2 rounded bg-gray-100">
        <div className={`h-2 rounded ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-right">{value == null ? '—' : `${value}${suffix}`}</span>
    </div>
  )
}

function Level({ level }: { level: string }) {
  const style =
    level === 'risk'
      ? 'bg-red-50 text-red-700'
      : level === 'watch'
        ? 'bg-amber-50 text-amber-700'
        : level === 'insufficient'
          ? 'bg-gray-100 text-gray-600'
          : 'bg-emerald-50 text-emerald-700'
  const label = level === 'risk' ? '风险' : level === 'watch' ? '关注' : level === 'insufficient' ? '样本不足' : '正常'
  return <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>
}
