import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, type Project } from '../lib/api'
import { Card, PageHeader, Select, Spinner } from '../components/ui'

type GanttIssue = {
  id: number
  subject: string
  project_id: number
  project_name: string
  project_identifier: string
  start_date: string | null
  due_date: string | null
  done_ratio: number
  status: { name: string; is_closed: boolean }
  tracker: string
  assigned_to?: string | null
  fixed_version_id: number | null
  fixed_version_name: string | null
  version_due: string | null
}

type GanttVersion = {
  id: number
  name: string
  project_id: number
  project_name: string
  effective_date: string | null
  status: string
}

type GanttData = {
  date_from: string
  date_to: string
  issues: GanttIssue[]
  versions: GanttVersion[]
}

type Span = { start: Date; end: Date }
type ViewRange = { start: Date; end: Date }

const MIN_DAYS = 7
const MAX_DAYS = 730

function parseDay(value: string | null | undefined) {
  return value ? parseISO(value) : null
}

function spanOf(start: Date | null, end: Date | null): Span | null {
  const from = start ?? end
  const to = end ?? start
  if (!from || !to) return null
  return from <= to ? { start: from, end: to } : { start: to, end: from }
}

function union(spans: Array<Span | null>): Span | null {
  const present = spans.filter((item): item is Span => item != null)
  if (present.length === 0) return null
  return {
    start: new Date(Math.min(...present.map((item) => item.start.getTime()))),
    end: new Date(Math.max(...present.map((item) => item.end.getTime()))),
  }
}

export function GanttPage() {
  const [data, setData] = useState<GanttData | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [months, setMonths] = useState('6')
  const [projectId, setProjectId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewRange | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<ViewRange | null>(null)
  viewRef.current = view

  useEffect(() => {
    void api<{ projects: Project[] }>('/projects.json?limit=100').then((res) => setProjects(res.projects ?? []))
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ months })
    if (projectId) qs.set('gantt_project_id', projectId)
    if (versionId) qs.set('fixed_version_id', versionId)
    void api<GanttData>(`/studio/gantt?${qs}`)
      .then((res) => {
        setData(res)
        setView({ start: parseISO(res.date_from), end: parseISO(res.date_to) })
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message || '甘特图加载失败')
        setLoading(false)
      })
  }, [months, projectId, versionId])

  const versions = useMemo(() => {
    const list = data?.versions ?? []
    return projectId ? list.filter((version) => String(version.project_id) === projectId) : list
  }, [data?.versions, projectId])

  useEffect(() => {
    const el = chartRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      const current = viewRef.current
      if (!current) return
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const timelineLeft = 280 + 12
      const timelineWidth = Math.max(1, rect.width - timelineLeft)
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - timelineLeft) / timelineWidth))
      const totalDays = Math.max(1, differenceInCalendarDays(current.end, current.start) + 1)
      const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15
      const nextDays = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(totalDays * factor)))
      const anchor = addDays(current.start, Math.round((totalDays - 1) * ratio))
      const start = addDays(anchor, -Math.round((nextDays - 1) * ratio))
      setView({ start, end: addDays(start, nextDays - 1) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    let dragging = false
    let originX = 0
    let originStart: Date | null = null
    let originEnd: Date | null = null
    let laneWidth = 1
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement | null
      const lane = target?.closest('[data-gantt-timeline]') as HTMLElement | null
      if (!lane) return
      const current = viewRef.current
      if (!current) return
      event.preventDefault()
      dragging = true
      originX = event.clientX
      originStart = current.start
      originEnd = current.end
      laneWidth = Math.max(1, lane.getBoundingClientRect().width)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', stopDrag)
      window.addEventListener('pointercancel', stopDrag)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || !originStart || !originEnd) return
      const span = Math.max(1, originEnd.getTime() - originStart.getTime())
      const delta = (-(event.clientX - originX) / laneWidth) * span
      setView({ start: new Date(originStart.getTime() + delta), end: new Date(originEnd.getTime() + delta) })
    }
    const stopDrag = () => {
      if (!dragging) return
      dragging = false
      originStart = null
      originEnd = null
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
    }
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', stopDrag)
    el.addEventListener('pointercancel', stopDrag)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', stopDrag)
      el.removeEventListener('pointercancel', stopDrag)
    }
  }, [loading, data])

  const range = useMemo(() => {
    const start = view?.start ?? (data?.date_from ? parseISO(data.date_from) : null)
    const end = view?.end ?? (data?.date_to ? parseISO(data.date_to) : null)
    if (!start || !end) return null
    const totalDays = Math.max(1, differenceInCalendarDays(end, start) + 1)
    const spanMs = Math.max(1, end.getTime() - start.getTime())
    const ticks: Array<{ date: Date; label: string }> = []
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    while (cursor <= end) {
      const include =
        totalDays <= 16 ||
        (totalDays <= 70 && (cursor.getTime() >= start.getTime() && cursor.getDay() === 1)) ||
        (totalDays > 70 && cursor.getDate() === 1)
      if (include && cursor.getTime() >= start.getTime() - 86400000) {
        ticks.push({
          date: new Date(cursor),
          label: format(cursor, totalDays > 180 ? 'yyyy-MM' : totalDays > 70 ? 'M月' : 'M/d'),
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    if (ticks.length === 0) ticks.push({ date: start, label: format(start, 'M/d') })
    const now = Date.now()
    const scale = totalDays <= 16 ? '按日' : totalDays <= 70 ? '按周' : '按月'
    return {
      start,
      end,
      totalDays,
      ticks,
      scale,
      todayLeft: now >= start.getTime() && now <= end.getTime() ? ((now - start.getTime()) / spanMs) * 100 : null,
    }
  }, [data, view])

  const groups = useMemo(() => {
    const issues = data?.issues ?? []
    const byProject = new Map<number, { name: string; identifier: string; issues: GanttIssue[] }>()
    for (const issue of issues) {
      const bucket = byProject.get(issue.project_id) ?? { name: issue.project_name, identifier: issue.project_identifier, issues: [] }
      bucket.issues.push(issue)
      byProject.set(issue.project_id, bucket)
    }
    return [...byProject.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name, 'zh'))
      .map(([id, project]) => {
        const byVersion = new Map<string, { id: number | null; name: string; due: string | null; issues: GanttIssue[] }>()
        for (const issue of project.issues) {
          const key = issue.fixed_version_id ? String(issue.fixed_version_id) : 'none'
          const bucket = byVersion.get(key) ?? {
            id: issue.fixed_version_id,
            name: issue.fixed_version_name || '未指定版本',
            due: issue.version_due,
            issues: [],
          }
          bucket.issues.push(issue)
          byVersion.set(key, bucket)
        }
        const versionGroups = [...byVersion.values()].sort((a, b) => {
          if (a.id == null) return 1
          if (b.id == null) return -1
          if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
          if (a.due && !b.due) return -1
          if (!a.due && b.due) return 1
          return a.name.localeCompare(b.name, 'zh')
        })
        return { id, ...project, versions: versionGroups }
      })
  }, [data?.issues])

  const grid = range
    ? range.ticks.map((tick) => ((tick.date.getTime() - range.start.getTime()) / Math.max(1, range.end.getTime() - range.start.getTime())) * 100)
    : []

  function bar(span: Span | null) {
    if (!span || !range) return null
    const windowMs = Math.max(1, range.end.getTime() - range.start.getTime())
    const startMs = Math.max(span.start.getTime(), range.start.getTime())
    const endMs = Math.min(span.end.getTime(), range.end.getTime())
    if (endMs <= range.start.getTime() || startMs >= range.end.getTime()) return null
    return {
      left: ((startMs - range.start.getTime()) / windowMs) * 100,
      width: Math.max(((endMs - startMs) / windowMs) * 100, 0.4),
    }
  }

  return (
    <div>
      <PageHeader title="甘特图" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value)
            setVersionId('')
          }}
          className="!w-44"
        >
          <option value="">全部项目</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        <Select value={versionId} onChange={(e) => setVersionId(e.target.value)} className="!w-52">
          <option value="">全部版本</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {projectId ? version.name : `${version.project_name} / ${version.name}`}
            </option>
          ))}
        </Select>
        <Select value={months} onChange={(e) => setMonths(e.target.value)} className="!w-32">
          <option value="3">3 个月</option>
          <option value="6">6 个月</option>
          <option value="12">12 个月</option>
        </Select>
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data || !range ? null : (
        <Card className="overflow-hidden p-4">
          <div ref={chartRef} className="min-w-0">
            <div className="mb-2 text-xs text-gray-500">
              按住 Ctrl 滚动滚轮缩放，拖动时间轴左右移动 · {format(range.start, 'yyyy-MM-dd')} 至 {format(range.end, 'yyyy-MM-dd')} · {range.totalDays} 天 · {range.scale}
            </div>
            <div className="grid grid-cols-[280px_minmax(0,1fr)] items-end gap-3 border-b border-gray-100 pb-2 text-xs text-gray-500">
              <div>项目 / 版本 / 工单</div>
              <div data-gantt-timeline className="relative h-6 cursor-grab overflow-hidden select-none">
                {range.ticks.map((tick) => {
                  const left = ((tick.date.getTime() - range.start.getTime()) / Math.max(1, range.end.getTime() - range.start.getTime())) * 100
                  return (
                    <span key={`${tick.label}-${tick.date.toISOString()}`} className="absolute top-0 whitespace-nowrap" style={{ left: `${left}%` }}>
                      {tick.label}
                    </span>
                  )
                })}
              </div>
            </div>
            {groups.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">这个范围内没有工单</p> : null}
            {groups.map((project) => {
              const projectSpan = union(
                project.versions.flatMap((version) =>
                  version.issues.map((issue) => spanOf(parseDay(issue.start_date), parseDay(issue.due_date) ?? parseDay(issue.version_due))),
                ),
              )
              return (
                <div key={project.id}>
                  <GanttRow
                    label={
                      <Link to={`/projects/${project.identifier}`} className="font-semibold text-gray-900 hover:text-blue-700">
                        {project.name}
                      </Link>
                    }
                    meta={`${project.issues.length} 个工单`}
                    bar={bar(projectSpan)}
                    tone="project"
                    todayLeft={range.todayLeft}
                    grid={grid}
                  />
                  {project.versions.map((version) => {
                    const issueSpans = version.issues.map((issue) => spanOf(parseDay(issue.start_date), parseDay(issue.due_date)))
                    const versionSpan = union([...issueSpans, spanOf(null, parseDay(version.due))])
                    return (
                      <div key={`${project.id}-${version.id ?? 'none'}`}>
                        <GanttRow
                          label={<span className="font-medium text-gray-800">{version.name}</span>}
                          meta={version.due ? `完成日期 ${version.due}` : version.id == null ? '没有目标版本的工单' : '未设置完成日期'}
                          indent="pl-4"
                          bar={bar(versionSpan)}
                          tone="version"
                          todayLeft={range.todayLeft}
                          grid={grid}
                        />
                        {version.issues.map((issue) => (
                          <GanttRow
                            key={issue.id}
                            label={
                              <Link to={`/issues/${issue.id}`} className={issue.status.is_closed ? 'text-gray-400 line-through hover:text-blue-700' : 'hover:text-blue-700'}>
                                #{issue.id} {issue.subject}
                              </Link>
                            }
                            meta={[issue.status.name, issue.assigned_to].filter(Boolean).join(' · ') || '未排期'}
                            indent="pl-8"
                            bar={bar(spanOf(parseDay(issue.start_date), parseDay(issue.due_date)))}
                            done={issue.done_ratio}
                            closed={issue.status.is_closed}
                            tone="issue"
                            todayLeft={range.todayLeft}
                            grid={grid}
                            unscheduled={!issue.start_date && !issue.due_date}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

function GanttRow({
  label,
  meta,
  indent = '',
  bar,
  done = 0,
  closed = false,
  tone,
  todayLeft,
  grid = [],
  unscheduled = false,
}: {
  label: ReactNode
  meta: string
  indent?: string
  bar: { left: number; width: number } | null
  done?: number
  closed?: boolean
  tone: 'project' | 'version' | 'issue'
  todayLeft: number | null
  grid?: number[]
  unscheduled?: boolean
}) {
  const track = tone === 'project' ? 'h-2 bg-gray-400' : tone === 'version' ? 'h-2.5 bg-indigo-400' : closed ? 'h-3 bg-gray-300' : 'h-3 bg-blue-500/80'
  return (
    <div className={['grid grid-cols-[280px_minmax(0,1fr)] items-center gap-3 border-b border-gray-50 py-1.5 text-sm', tone === 'project' ? 'bg-gray-50/80' : ''].join(' ')}>
      <div className={`min-w-0 ${indent}`}>
        <div className="truncate">{label}</div>
        <div className="truncate text-xs text-gray-500">{meta}</div>
      </div>
      <div data-gantt-timeline className="relative h-8 cursor-grab overflow-hidden rounded bg-gray-50 select-none active:cursor-grabbing">
        {grid.map((left) => (
          <div key={left} className="absolute inset-y-0 w-px bg-gray-200/80" style={{ left: `${left}%` }} />
        ))}
        {todayLeft != null ? <div className="absolute inset-y-0 z-[1] w-px bg-rose-300" style={{ left: `${todayLeft}%` }} /> : null}
        {bar ? (
          <div className={`absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-full ${track}`} style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 0.6)}%` }}>
            {tone === 'issue' && done > 0 ? <div className="h-full bg-blue-700/70" style={{ width: `${Math.min(done, 100)}%` }} /> : null}
          </div>
        ) : unscheduled ? (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">未排期</span>
        ) : null}
      </div>
    </div>
  )
}
