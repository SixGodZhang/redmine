import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useIssueForm } from './IssueFormPage'
import { api, type Issue } from '../../lib/api'
import { IssueTable } from '../../components/IssueTable'
import { Button, Input, PageHeader, Select, Spinner } from '../../components/ui'

export function IssuesListPage() {
  const [params, setParams] = useSearchParams()
  const { openCreate, savedTick } = useIssueForm()
  const [issues, setIssues] = useState<Issue[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [statuses, setStatuses] = useState<Array<{ id: number; name: string }>>([])

  const statusId = params.get('status_id') ?? 'open'
  const subject = params.get('subject') ?? ''

  useEffect(() => {
    void api<{ issue_statuses: Array<{ id: number; name: string }> }>('/issue_statuses.json').then((res) => {
      setStatuses(res.issue_statuses ?? [])
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ limit: '50', status_id: statusId })
    if (subject) qs.set('subject', subject)
    void api<{ issues: Issue[]; total_count?: number }>(`/issues.json?${qs}`).then((res) => {
      setIssues(res.issues ?? [])
      setTotal(res.total_count ?? res.issues?.length ?? 0)
      setLoading(false)
    })
  }, [statusId, subject, refreshKey, savedTick])

  return (
    <div>
      <PageHeader
        title="工单"
        actions={<Button onClick={() => openCreate()}>新建工单</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          value={statusId}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            next.set('status_id', e.target.value)
            setParams(next)
          }}
          className="w-40"
        >
          <option value="open">未关闭</option>
          <option value="*">全部状态</option>
          {statuses.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder="标题筛选"
          defaultValue={subject}
          className="max-w-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const next = new URLSearchParams(params)
              const v = (e.target as HTMLInputElement).value.trim()
              if (v) next.set('subject', v)
              else next.delete('subject')
              setParams(next)
            }
          }}
        />
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <IssueTable
          issues={issues}
          total={total}
          emptyTitle="没有工单"
          onUpdated={() => setRefreshKey((value) => value + 1)}
        />
      )}
    </div>
  )
}
