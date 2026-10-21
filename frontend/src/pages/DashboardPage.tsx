import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIssueForm } from './issues/IssueFormPage'
import { api, type Issue, type Project } from '../lib/api'
import { IssueDrawer } from '../components/IssueDrawer'
import { Card, EmptyState, PageHeader, Select, Spinner, StatusBadge } from '../components/ui'

const FILTER_KEY = 'studio_dashboard_issues'
const PAGE_SIZE = 15

type Scope = 'assigned' | 'authored' | 'watched' | 'all'
type DashboardFilter = {
  scope: Scope
  statusId: string
  projectId: string
}

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'assigned', label: '指派给我' },
  { id: 'authored', label: '我创建的' },
  { id: 'watched', label: '我关注的' },
  { id: 'all', label: '全部工单' },
]

function loadFilter(): DashboardFilter {
  try {
    const raw = JSON.parse(localStorage.getItem(FILTER_KEY) || '') as Partial<DashboardFilter>
    const scope = SCOPES.some((item) => item.id === raw.scope) ? raw.scope! : 'assigned'
    return {
      scope,
      statusId: typeof raw.statusId === 'string' && raw.statusId ? raw.statusId : 'open',
      projectId: typeof raw.projectId === 'string' ? raw.projectId : '',
    }
  } catch {
    return { scope: 'assigned', statusId: 'open', projectId: '' }
  }
}

function issueQuery(filter: DashboardFilter, page: number) {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), sort: 'updated_on:desc' })
  if (filter.projectId) qs.set('project_id', filter.projectId)
  qs.set('status_id', filter.statusId === 'open' ? 'o' : filter.statusId)
  if (filter.scope === 'assigned') qs.set('assigned_to_id', 'me')
  if (filter.scope === 'authored') qs.set('author_id', 'me')
  if (filter.scope === 'watched') qs.set('watcher_id', 'me')
  return qs
}

export function DashboardPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [total, setTotal] = useState(0)
  const [projects, setProjects] = useState<Project[]>([])
  const [statuses, setStatuses] = useState<Array<{ id: number; name: string }>>([])
  const [filter, setFilter] = useState<DashboardFilter>(loadFilter)
  const [page, setPage] = useState(0)
  const [ready, setReady] = useState(false)
  const [issuesLoading, setIssuesLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { openCreate, savedTick } = useIssueForm()

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      api<{ projects: Project[] }>('/projects.json?limit=100'),
      api<{ issue_statuses: Array<{ id: number; name: string }> }>('/issue_statuses.json'),
    ])
      .then(([projectRes, statusRes]) => {
        if (cancelled) return
        setProjects(projectRes.projects ?? [])
        setStatuses(statusRes.issue_statuses ?? [])
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setIssuesLoading(true)
    void api<{ issues: Issue[]; total_count?: number }>(`/issues.json?${issueQuery(filter, page)}`)
      .then((res) => {
        if (cancelled) return
        const count = res.total_count ?? res.issues?.length ?? 0
        const lastPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1)
        if (page > lastPage) {
          setPage(lastPage)
          return
        }
        setIssues(res.issues ?? [])
        setTotal(count)
      })
      .finally(() => {
        if (!cancelled) setIssuesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filter, page, refreshKey, savedTick])

  function updateFilter(patch: Partial<DashboardFilter>) {
    setPage(0)
    setFilter((current) => {
      const next = { ...current, ...patch }
      localStorage.setItem(FILTER_KEY, JSON.stringify(next))
      return next
    })
  }

  if (!ready) return <Spinner />

  const recentProjects = projects.slice(0, 6)

  return (
    <div className="space-y-6">
      <PageHeader title="工作台" actions={<button type="button" className="text-sm text-blue-600" onClick={() => openCreate()}>新建工单</button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="space-y-3 border-b border-gray-100 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">工单</div>
              <div className="text-xs text-gray-500">{issuesLoading ? '加载中…' : `共 ${total} 条`}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={filter.scope} onChange={(e) => updateFilter({ scope: e.target.value as Scope })} className="!w-32">
                {SCOPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <Select value={filter.statusId} onChange={(e) => updateFilter({ statusId: e.target.value })} className="!w-32">
                <option value="open">未关闭</option>
                <option value="*">全部状态</option>
                {statuses.map((status) => (
                  <option key={status.id} value={String(status.id)}>
                    {status.name}
                  </option>
                ))}
              </Select>
              <Select value={filter.projectId} onChange={(e) => updateFilter({ projectId: e.target.value })} className="!w-36">
                <option value="">全部项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={String(project.id)}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {issuesLoading ? (
            <Spinner />
          ) : issues.length === 0 ? (
            <div className="p-4">
              <EmptyState title="没有符合条件的工单" description="换一个筛选条件试试" />
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <button type="button" onClick={() => setOpenId(issue.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className={['truncate text-sm font-medium', issue.status.is_closed ? 'text-gray-400 line-through' : 'text-gray-900'].join(' ')}>
                        #{issue.id} {issue.subject}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {issue.project.name}
                        {issue.assigned_to?.name ? ` · ${issue.assigned_to.name}` : ''}
                      </div>
                    </div>
                    <StatusBadge name={issue.status.name} closed={issue.status.is_closed} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {total > PAGE_SIZE ? (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-sm">
              <button type="button" className="text-blue-600 disabled:text-gray-300" disabled={page === 0 || issuesLoading} onClick={() => setPage((current) => current - 1)}>
                上一页
              </button>
              <span className="text-xs text-gray-500">
                {page + 1} / {Math.ceil(total / PAGE_SIZE)}
              </span>
              <button
                type="button"
                className="text-blue-600 disabled:text-gray-300"
                disabled={issuesLoading || (page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((current) => current + 1)}
              >
                下一页
              </button>
            </div>
          ) : null}
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 font-medium">最近项目</div>
          <ul className="divide-y divide-gray-100">
            {recentProjects.map((project) => (
              <li key={project.id}>
                <Link to={`/projects/${project.identifier}`} className="block px-4 py-3 hover:bg-gray-50">
                  <div className="font-medium text-gray-900">{project.name}</div>
                  <div className="text-xs text-gray-500">{project.identifier}</div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <IssueDrawer issueId={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} onUpdated={() => setRefreshKey((value) => value + 1)} />
    </div>
  )
}
