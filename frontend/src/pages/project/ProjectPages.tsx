import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { useIssueForm } from '../issues/IssueFormPage'
import { api, type Issue, type Project } from '../../lib/api'
import { useConfirm } from '../../components/ConfirmDialog'
import { FormDialog } from '../../components/FormDialog'
import { IssueTable } from '../../components/IssueTable'
import { Button, Card, EmptyState, Input, PageHeader, Select, Spinner } from '../../components/ui'

export function ProjectOverviewPage() {
  const { project } = useOutletContext<{ project: Project }>()
  return (
    <Card className="p-4">
      <h2 className="font-medium">项目概述</h2>
      <div
        className="prose prose-sm mt-3 max-w-none text-gray-700"
        dangerouslySetInnerHTML={{ __html: project.description || '<p>暂无描述</p>' }}
      />
    </Card>
  )
}

type Named = { id: number; name: string }

async function fetchAllIssues(query: URLSearchParams) {
  const limit = 100
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  const issues: Issue[] = []
  while (offset < total) {
    const page = new URLSearchParams(query)
    page.set('limit', String(limit))
    page.set('offset', String(offset))
    const res = await api<{ issues: Issue[]; total_count?: number }>(`/issues.json?${page}`)
    const batch = res.issues ?? []
    total = res.total_count ?? offset + batch.length
    issues.push(...batch)
    if (batch.length === 0) break
    offset += batch.length
  }
  return { issues, total: Number.isFinite(total) ? total : issues.length }
}

export function ProjectIssuesPage() {
  const { project } = useOutletContext<{ project: Project }>()
  const [issues, setIssues] = useState<Issue[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const { openCreate, savedTick } = useIssueForm()
  const [statuses, setStatuses] = useState<Named[]>([])
  const [trackers, setTrackers] = useState<Named[]>([])
  const [priorities, setPriorities] = useState<Named[]>([])
  const [assignees, setAssignees] = useState<Named[]>([])
  const [versions, setVersions] = useState<Named[]>([])
  const [statusId, setStatusId] = useState('*')
  const [trackerId, setTrackerId] = useState('')
  const [priorityId, setPriorityId] = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [subject, setSubject] = useState('')
  const [appliedSubject, setAppliedSubject] = useState('')

  useEffect(() => {
    void Promise.all([
      api<{ issue_statuses: Named[] }>('/issue_statuses.json'),
      api<{ trackers: Named[] }>('/trackers.json'),
      api<{ issue_priorities: Named[] }>('/enumerations/IssuePriority.json'),
      api<{ memberships: Array<{ user?: Named }> }>(`/projects/${project.id}/memberships.json`),
      api<{ versions: Named[] }>(`/projects/${project.id}/versions.json`),
    ]).then(([statusRes, trackerRes, priorityRes, memberRes, versionRes]) => {
      setStatuses(statusRes.issue_statuses ?? [])
      setTrackers(trackerRes.trackers ?? [])
      setPriorities(priorityRes.issue_priorities ?? [])
      setAssignees((memberRes.memberships ?? []).flatMap((item) => (item.user ? [item.user] : [])))
      setVersions(versionRes.versions ?? [])
    })
  }, [project.id])

  useEffect(() => {
    const query = new URLSearchParams({ project_id: String(project.id), status_id: statusId })
    if (trackerId) query.set('tracker_id', trackerId)
    if (priorityId) query.set('priority_id', priorityId)
    if (assignedToId) query.set('assigned_to_id', assignedToId)
    if (versionId) query.set('fixed_version_id', versionId)
    if (appliedSubject) query.set('subject', `~${appliedSubject}`)
    setLoading(true)
    void fetchAllIssues(query)
      .then((res) => {
        setIssues(res.issues)
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [project.id, statusId, trackerId, priorityId, assignedToId, versionId, appliedSubject, refreshKey, savedTick])

  return (
    <div>
      <PageHeader title="工单" actions={<button type="button" className="text-sm text-blue-600" onClick={() => openCreate(String(project.id))}>新建</button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={statusId} onChange={(e) => setStatusId(e.target.value)} className="!w-40">
          <option value="*">全部状态</option>
          <option value="o">未关闭</option>
          {statuses.map((status) => (
            <option key={status.id} value={String(status.id)}>
              {status.name}
            </option>
          ))}
        </Select>
        <Select value={trackerId} onChange={(e) => setTrackerId(e.target.value)} className="!w-40">
          <option value="">全部跟踪标签</option>
          {trackers.map((tracker) => (
            <option key={tracker.id} value={tracker.id}>
              {tracker.name}
            </option>
          ))}
        </Select>
        <Select value={priorityId} onChange={(e) => setPriorityId(e.target.value)} className="!w-40">
          <option value="">全部优先级</option>
          {priorities.map((priority) => (
            <option key={priority.id} value={priority.id}>
              {priority.name}
            </option>
          ))}
        </Select>
        <Select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="!w-40">
          <option value="">全部指派</option>
          {assignees.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
        <Select value={versionId} onChange={(e) => setVersionId(e.target.value)} className="!w-44">
          <option value="">全部目标版本</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.name}
            </option>
          ))}
        </Select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setAppliedSubject(subject.trim())
          }}
        >
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="主题筛选" className="!w-48" />
          <Button type="submit" variant="secondary">
            筛选
          </Button>
        </form>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <IssueTable
          issues={issues}
          showProject={false}
          projectId={project.id}
          total={total}
          emptyTitle="没有符合条件的工单"
          onUpdated={() => setRefreshKey((value) => value + 1)}
        />
      )}
    </div>
  )
}

export function ProjectVersionsPage() {
  const { project } = useOutletContext<{ project: Project }>()
  const [versions, setVersions] = useState<Array<{ id: number; name: string }>>([])
  const [canManage, setCanManage] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  async function load() {
    const res = await api<{ can_manage: boolean; versions: Array<{ id: number; name: string }> }>(
      `/studio/projects/${project.id}/versions`,
    )
    setCanManage(res.can_manage)
    setVersions(res.versions ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [project.id])

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="目标版本"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setName('')
                setError(null)
                setCreating(true)
              }}
            >
              添加目标版本
            </Button>
          ) : null
        }
      />
      <p className="mb-4 text-sm text-gray-500">目标版本是本项目的枚举。项目管理员可以增加或删除。</p>
      {error && !creating ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <FormDialog
        open={creating}
        title="添加目标版本"
        saving={savingCreate}
        error={creating ? error : null}
        onClose={() => setCreating(false)}
        onSubmit={async (e) => {
          e.preventDefault()
          setSavingCreate(true)
          setError(null)
          try {
            await api(`/studio/projects/${project.id}/versions`, { method: 'POST', body: { name } })
            setCreating(false)
            await load()
          } catch (err) {
            setError(err instanceof Error ? err.message : '添加失败')
          } finally {
            setSavingCreate(false)
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="目标版本名称" required />
      </FormDialog>
      {versions.length === 0 ? (
        <EmptyState title="暂无目标版本" />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {versions.map((version) => (
            <li key={version.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{version.name}</span>
              {canManage ? (
                <Button
                  variant="danger"
                  onClick={async () => {
                    const ok = await confirm({
                      title: '删除目标版本',
                      description: `确定删除目标版本「${version.name}」？已被工单使用的版本不能删除。`,
                    })
                    if (!ok) return
                    setError(null)
                    try {
                      await api(`/studio/projects/${project.id}/versions/${version.id}`, { method: 'DELETE' })
                      await load()
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '删除失败')
                    }
                  }}
                >
                  删除
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  )
}

export function ProjectWikiPage() {
  const { identifier } = useParams()
  const [pages, setPages] = useState<Array<{ title: string; version: number }>>([])
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('Wiki')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const index = await api<{ wiki_pages: Array<{ title: string; version: number }> }>(`/projects/${identifier}/wiki/index.json`)
        setPages(index.wiki_pages ?? [])
        const start = index.wiki_pages?.[0]?.title
        if (start) {
          const page = await api<{ wiki_page: { title: string; text: string } }>(
            `/projects/${identifier}/wiki/${encodeURIComponent(start)}.json`,
          )
          setTitle(page.wiki_page.title)
          setContent(page.wiki_page.text)
        }
      } catch {
        setContent('')
      } finally {
        setLoading(false)
      }
    })()
  }, [identifier])

  if (loading) return <Spinner />

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Card className="p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-gray-400">页面</div>
        <ul className="space-y-1 text-sm">
          {pages.map((p) => (
            <li key={p.title}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left hover:bg-gray-50"
                onClick={async () => {
                  const page = await api<{ wiki_page: { title: string; text: string } }>(
                    `/projects/${identifier}/wiki/${encodeURIComponent(p.title)}.json`,
                  )
                  setTitle(page.wiki_page.title)
                  setContent(page.wiki_page.text)
                }}
              >
                {p.title}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-4">
        <PageHeader title={title} />
        <pre className="whitespace-pre-wrap text-sm text-gray-800">{content || '暂无 Wiki 内容，可在 Redmine 中创建首页。'}</pre>
      </Card>
    </div>
  )
}

export function ProjectNewsPage() {
  const { project } = useOutletContext<{ project: Project }>()
  const [news, setNews] = useState<Array<{ id: number; title: string; description: string; created_on: string }>>([])

  useEffect(() => {
    void api<{ news: typeof news }>(`/projects/${project.id}/news.json`).then((res) => setNews(res.news ?? []))
  }, [project.id])

  return (
    <div className="space-y-3">
      {news.length === 0 ? <EmptyState title="暂无新闻" /> : null}
      {news.map((n) => (
        <Card key={n.id} className="p-4">
          <h3 className="font-medium">{n.title}</h3>
          <div className="text-xs text-gray-500">{new Date(n.created_on).toLocaleString()}</div>
          <div className="prose prose-sm mt-2 max-w-none" dangerouslySetInnerHTML={{ __html: n.description }} />
        </Card>
      ))}
    </div>
  )
}

export function ProjectDocumentsPage() {
  const { project } = useOutletContext<{ project: Project }>()
  const [docs, setDocs] = useState<Array<{ id: number; title: string; description: string }>>([])

  useEffect(() => {
    void api<{ documents: typeof docs }>(`/projects/${project.id}/documents.json`).then((res) => setDocs(res.documents ?? []))
  }, [project.id])

  return (
    <div className="space-y-3">
      {docs.length === 0 ? <EmptyState title="暂无文档" /> : null}
      {docs.map((d) => (
        <Card key={d.id} className="p-4">
          <h3 className="font-medium">{d.title}</h3>
          <p className="mt-1 text-sm text-gray-600">{d.description}</p>
        </Card>
      ))}
    </div>
  )
}

export function ProjectFilesPage() {
  const { identifier } = useParams()
  const [files, setFiles] = useState<Array<{ id: number; filename: string; filesize: number; created_on: string }>>([])

  useEffect(() => {
    void api<{ files: typeof files }>(`/projects/${identifier}/files.json`).then((res) => setFiles(res.files ?? []))
  }, [identifier])

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {files.length === 0 ? <div className="p-6"><EmptyState title="暂无文件" /></div> : null}
      <ul className="divide-y divide-gray-100">
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{f.filename}</span>
            <span className="text-gray-500">{(f.filesize / 1024).toFixed(1)} KB</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProjectBoardsPage() {
  const { project } = useOutletContext<{ project: Project }>()
  const [boards, setBoards] = useState<Array<{ id: number; name: string; description: string; topics_count: number }>>([])

  useEffect(() => {
    void api<{ boards: typeof boards }>(`/studio/projects/${project.id}/boards`).then((res) => setBoards(res.boards ?? []))
  }, [project.id])

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {boards.length === 0 ? <EmptyState title="暂无讨论板" /> : null}
      {boards.map((b) => (
        <Card key={b.id} className="p-4">
          <h3 className="font-medium">{b.name}</h3>
          <p className="mt-1 text-sm text-gray-600">{b.description}</p>
          <p className="mt-2 text-xs text-gray-500">{b.topics_count} 主题</p>
        </Card>
      ))}
    </div>
  )
}

export function ProjectTimePage() {
  const { project } = useOutletContext<{ project: Project }>()
  const [entries, setEntries] = useState<Array<{ id: number; hours: number; comments: string; spent_on: string; user: { name: string } }>>([])

  useEffect(() => {
    void api<{ time_entries: typeof entries }>(`/time_entries.json?project_id=${project.id}&limit=50`).then((res) =>
      setEntries(res.time_entries ?? []),
    )
  }, [project.id])

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {entries.length === 0 ? <div className="p-6"><EmptyState title="暂无时间记录" /></div> : null}
      <table className="min-w-full text-sm">
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-gray-100">
              <td className="px-4 py-2">{e.spent_on}</td>
              <td className="px-4 py-2">{e.user.name}</td>
              <td className="px-4 py-2">{e.hours} h</td>
              <td className="px-4 py-2 text-gray-600">{e.comments}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
