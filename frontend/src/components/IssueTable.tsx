import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { ChevronDown, ChevronRight, Copy, GripVertical, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, type Issue } from '../lib/api'
import { IssueDrawer } from './IssueDrawer'
import { Button, EmptyState, StatusBadge } from './ui'

const STORAGE_KEY = 'studio_issue_columns'

const DEFAULT_VISIBLE = [
  'tracker',
  'status',
  'fixed_version',
  'priority',
  'total_spent_hours',
  'estimated_hours',
  'start_date',
  'due_date',
]

type ColumnDef = { id: string; label: string; format?: string }

const BUILTIN_COLUMNS: ColumnDef[] = [
  { id: 'project', label: '项目' },
  { id: 'tracker', label: '跟踪标签' },
  { id: 'status', label: '状态' },
  { id: 'priority', label: '优先级' },
  { id: 'fixed_version', label: '目标版本' },
  { id: 'assigned_to', label: '指派给' },
  { id: 'author', label: '作者' },
  { id: 'category', label: '类别' },
  { id: 'parent', label: '父单' },
  { id: 'done_ratio', label: '完成百分比' },
  { id: 'estimated_hours', label: '预估工作量' },
  { id: 'total_estimated_hours', label: '总预估' },
  { id: 'spent_hours', label: '工时' },
  { id: 'total_spent_hours', label: '总工时' },
  { id: 'start_date', label: '开始日期' },
  { id: 'due_date', label: '完成日期' },
  { id: 'created_on', label: '创建于' },
  { id: 'updated_on', label: '更新于' },
]

type ColumnPrefs = { order: string[]; visible: string[] }

function readPrefs(): ColumnPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ColumnPrefs
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.visible)) return null
    return parsed
  } catch {
    return null
  }
}

function mergePrefs(current: ColumnPrefs | null, ids: string[], defaults: string[]): ColumnPrefs {
  if (!current) return { order: ids, visible: defaults.filter((id) => ids.includes(id)) }
  return {
    order: [...current.order, ...ids.filter((id) => !current.order.includes(id))],
    visible: current.visible,
  }
}

function cell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  return value
}

function hours(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return value
}

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatCustom(
  value: string | string[] | null | undefined,
  format?: string,
  userNames?: Record<string, string>,
) {
  if (Array.isArray(value)) {
    const parts = value.filter(Boolean).map((item) => (format === 'user' ? userNames?.[item] || item : item))
    return parts.length ? parts.join('、') : '—'
  }
  if (value == null || value === '') return '—'
  if (format === 'bool') {
    if (value === '1') return '是'
    if (value === '0') return '否'
  }
  if (format === 'user') return userNames?.[value] || value
  return value
}

function renderColumn(issue: Issue, column: ColumnDef, userNames: Record<string, string>): ReactNode {
  switch (column.id) {
    case 'project':
      return cell(issue.project?.name)
    case 'tracker':
      return cell(issue.tracker?.name)
    case 'status':
      return <StatusBadge name={issue.status.name} closed={issue.status.is_closed} />
    case 'priority':
      return cell(issue.priority?.name)
    case 'fixed_version':
      return cell(issue.fixed_version?.name)
    case 'assigned_to':
      return cell(issue.assigned_to?.name)
    case 'author':
      return cell(issue.author?.name)
    case 'category':
      return cell(issue.category?.name)
    case 'parent':
      return issue.parent?.id ? `#${issue.parent.id}` : '—'
    case 'done_ratio':
      return `${issue.done_ratio ?? 0}%`
    case 'estimated_hours':
      return hours(issue.estimated_hours)
    case 'total_estimated_hours':
      return hours(issue.total_estimated_hours)
    case 'spent_hours':
      return hours(issue.spent_hours)
    case 'total_spent_hours':
      return hours(issue.total_spent_hours ?? issue.spent_hours)
    case 'start_date':
      return cell(issue.start_date)
    case 'due_date':
      return cell(issue.due_date)
    case 'created_on':
      return formatTime(issue.created_on)
    case 'updated_on':
      return formatTime(issue.updated_on)
    default: {
      if (!column.id.startsWith('cf:')) return '—'
      const id = Number(column.id.slice(3))
      const field = issue.custom_fields?.find((item) => item.id === id)
      return formatCustom(field?.value, column.format, userNames)
    }
  }
}

type Node = { issue: Issue; children: Node[] }

function buildTree(issues: Issue[]): Node[] {
  const ids = new Set(issues.map((issue) => issue.id))
  const childrenOf = new Map<number, Issue[]>()
  const roots: Issue[] = []
  for (const issue of issues) {
    const parentId = issue.parent?.id
    if (parentId && parentId !== issue.id && ids.has(parentId)) {
      const list = childrenOf.get(parentId) ?? []
      list.push(issue)
      childrenOf.set(parentId, list)
    } else {
      roots.push(issue)
    }
  }
  const toNode = (issue: Issue): Node => ({
    issue,
    children: (childrenOf.get(issue.id) ?? []).map(toNode),
  })
  return roots.map(toNode)
}

function issueLink(id: number) {
  return `${window.location.origin}/app/issues/${id}`
}

function IssueCopyButton({ issue }: { issue: Issue }) {
  const [copied, setCopied] = useState<'single' | 'double' | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<number | null>(null)

  async function write(text: string, kind: 'single' | 'double') {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1200)
  }

  function placeTip(target: HTMLElement) {
    const rect = target.getBoundingClientRect()
    setTip({ x: rect.right + 8, y: rect.top + rect.height / 2 })
  }

  const plain = `#${issue.id} ${issue.subject}`
  const detailed = `${issue.tracker?.name ?? ''} #${issue.id} ${issue.subject} ${issueLink(issue.id)}`.replace(/\s+/g, ' ').trim()

  return (
    <>
      <button
        type="button"
        aria-label="复制工单"
        className="ml-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-white hover:text-gray-700 group-hover:inline-flex"
        onMouseEnter={(event) => placeTip(event.currentTarget)}
        onMouseLeave={() => setTip(null)}
        onClick={(event) => {
          event.stopPropagation()
          if (timer.current) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            void write(plain, 'single')
          }, 220)
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (timer.current) window.clearTimeout(timer.current)
          void write(detailed, 'double')
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {tip ? (
        <span
          className="pointer-events-none fixed z-50 w-max max-w-xs -translate-y-1/2 rounded bg-gray-900 px-2.5 py-1.5 text-left text-[11px] leading-5 text-white shadow-lg"
          style={{ left: tip.x, top: tip.y }}
        >
          {copied === 'single' ? '已复制：#ID + 主题' : copied === 'double' ? '已复制：跟踪标签 + #ID + 主题 + 链接' : (
            <>
              单击复制 #ID + 主题
              <br />
              双击复制 跟踪标签 + #ID + 主题 + 链接
            </>
          )}
        </span>
      ) : null}
    </>
  )
}

function flatten(nodes: Node[], collapsed: Set<number>, depth = 0): Array<{ node: Node; depth: number }> {
  const rows: Array<{ node: Node; depth: number }> = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (node.children.length > 0 && !collapsed.has(node.issue.id)) {
      rows.push(...flatten(node.children, collapsed, depth + 1))
    }
  }
  return rows
}

export function IssueTable({
  issues,
  showProject = true,
  projectId,
  total,
  emptyTitle = '没有工单',
  onUpdated,
}: {
  issues: Issue[]
  showProject?: boolean
  projectId?: number
  total?: number
  emptyTitle?: string
  onUpdated?: () => void
}) {
  const [openId, setOpenId] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customColumns, setCustomColumns] = useState<ColumnDef[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [prefs, setPrefs] = useState<ColumnPrefs | null>(() => readPrefs())
  const dragId = useRef<string | null>(null)
  const rows = useMemo(() => flatten(buildTree(issues), collapsed), [issues, collapsed])

  const available = useMemo(() => {
    const builtin = BUILTIN_COLUMNS.filter((column) => showProject || column.id !== 'project')
    return [...builtin, ...customColumns]
  }, [customColumns, showProject])

  const defaults = useMemo(
    () => (showProject ? ['project', ...DEFAULT_VISIBLE] : DEFAULT_VISIBLE),
    [showProject],
  )

  useEffect(() => {
    const params = projectId ? `?project_id=${projectId}` : ''
    void api<{ fields: Array<{ id: number; name: string; field_format: string }> }>(`/studio/issue_columns${params}`)
      .then((res) => {
        setCustomColumns(
          (res.fields ?? []).map((field) => ({
            id: `cf:${field.id}`,
            label: field.name,
            format: field.field_format,
          })),
        )
      })
      .catch(() => setCustomColumns([]))
  }, [projectId])

  useEffect(() => {
    if (!customColumns.some((column) => column.format === 'user')) return
    void api<{ users: Array<{ id: number; name: string }> }>('/studio/user_names').then((res) => {
      const names: Record<string, string> = {}
      for (const user of res.users ?? []) names[String(user.id)] = user.name
      setUserNames(names)
    }).catch(() => setUserNames({}))
  }, [customColumns])

  useEffect(() => {
    setPrefs((current) => mergePrefs(current ?? readPrefs(), available.map((column) => column.id), defaults))
  }, [available, defaults])

  const columns = useMemo(() => {
    if (!prefs) return []
    const byId = new Map(available.map((column) => [column.id, column]))
    return prefs.order.filter((id) => prefs.visible.includes(id)).flatMap((id) => {
      const column = byId.get(id)
      return column ? [column] : []
    })
  }, [available, prefs])

  function toggle(id: number) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function updatePrefs(next: ColumnPrefs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setPrefs(next)
  }

  function toggleColumn(id: string) {
    setPrefs((current) => {
      if (!current) return current
      const visible = current.visible.includes(id) ? current.visible.filter((item) => item !== id) : [...current.visible, id]
      const next = { ...current, visible }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  function moveColumn(targetId: string) {
    const sourceId = dragId.current
    dragId.current = null
    if (!sourceId || sourceId === targetId) return
    setPrefs((current) => {
      if (!current) return current
      const order = [...current.order]
      const from = order.indexOf(sourceId)
      const to = order.indexOf(targetId)
      if (from < 0 || to < 0) return current
      order.splice(from, 1)
      order.splice(to, 0, sourceId)
      const next = { ...current, order }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const orderedColumns = prefs
    ? prefs.order.flatMap((id) => {
        const column = available.find((item) => item.id === id)
        return column ? [column] : []
      })
    : available

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500">{total != null ? `共 ${total} 条` : null}</div>
        <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="h-4 w-4" />
          列设置
        </Button>
      </div>
      {issues.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">#</th>
                <th className="whitespace-nowrap px-3 py-2">主题</th>
                {columns.map((column) => (
                  <th key={column.id} className="whitespace-nowrap px-3 py-2">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth }) => {
                const issue = node.issue
                const hasChildren = node.children.length > 0
                const isCollapsed = collapsed.has(issue.id)
                return (
                  <tr
                    key={issue.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`打开工单 #${issue.id} ${issue.subject}`}
                    className={[
                      'group cursor-pointer border-t border-gray-100 hover:bg-blue-50/60',
                      openId === issue.id ? 'bg-blue-50' : '',
                      depth > 0 ? 'bg-gray-50/40' : '',
                    ].join(' ')}
                    onClick={() => setOpenId(issue.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setOpenId(issue.id)
                      }
                    }}
                  >
                    <td
                      className={[
                        'whitespace-nowrap px-3 py-2',
                        issue.status.is_closed ? 'text-gray-400 line-through' : 'text-gray-500',
                      ].join(' ')}
                    >
                      {issue.id}
                    </td>
                    <td className="max-w-md px-3 py-2">
                      <div className="flex items-center" style={{ paddingLeft: depth * 22 }}>
                        {hasChildren ? (
                          <button
                            type="button"
                            aria-label={isCollapsed ? '展开子单' : '折叠子单'}
                            className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-200"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggle(issue.id)
                            }}
                          >
                            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center text-gray-300">
                            {depth > 0 ? <span className="h-px w-3 bg-gray-300" /> : null}
                          </span>
                        )}
                        <span
                          className={[
                            'truncate',
                            issue.status.is_closed ? 'font-normal text-gray-400 line-through' : 'font-medium text-gray-900',
                          ].join(' ')}
                        >
                          {issue.subject}
                        </span>
                        <IssueCopyButton issue={issue} />
                        {hasChildren ? (
                          <span className="ml-2 shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                            总单 {node.children.length}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {columns.map((column) => (
                      <td key={column.id} className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {renderColumn(issue, column, userNames)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-white p-5 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">列设置</DialogTitle>
            <p className="mt-1 text-sm text-gray-500">勾选要显示的列，拖动整行可以调整顺序。# 和主题始终显示。</p>
            <ul className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto">
              {orderedColumns.map((column) => {
                const checked = prefs?.visible.includes(column.id) ?? false
                return (
                  <li
                    key={column.id}
                    draggable
                    onDragStart={() => {
                      dragId.current = column.id
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveColumn(column.id)}
                    className="flex cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-gray-200 hover:bg-gray-50 active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-gray-800">
                      <input type="checkbox" checked={checked} onChange={() => toggleColumn(column.id)} />
                      <span className="truncate">{column.label}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => updatePrefs({ order: available.map((column) => column.id), visible: defaults })}
              >
                恢复默认
              </Button>
              <Button onClick={() => setSettingsOpen(false)}>完成</Button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
      <IssueDrawer issueId={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} onUpdated={onUpdated} />
    </>
  )
}
