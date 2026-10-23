import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { AlertTriangle, Plus, Settings2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { api, type Project } from '../lib/api'
import { IssueDrawer } from '../components/IssueDrawer'
import { useConfirm } from '../components/ConfirmDialog'
import { Button, EmptyState, Input, Select, Spinner, cn } from '../components/ui'

type Scope = 'all' | 'assigned' | 'authored' | 'watched'
type GroupBy = 'none' | 'assigned_to' | 'tracker' | 'version'
type Filters = {
  project_id: string
  fixed_version_id: string
  tracker_id: string
  assigned_to_id: string
  author_id: string
  scope: Scope
}

type BoardColumn = {
  id: number
  name: string
  section_name?: string
  position: number
  status_ids: number[]
  target_status_id: number
}

type Board = {
  id: number
  name: string
  filters: Filters
  group_by: GroupBy
  columns: BoardColumn[]
}

type Named = { id: number; name: string }
type Card = {
  id: number
  subject: string
  created_on: string
  updated_on?: string
  due_date?: string | null
  done_ratio?: number
  tracker?: Named
  status?: Named
  assigned_to?: Named
  priority?: Named
  project?: Named
  fixed_version?: Named
}

type ColumnData = {
  id: number
  name: string
  total: number
  offset: number
  issues: Card[]
}

type DraftColumn = {
  name: string
  section_name: string
  status_ids: number[]
  target_status_id: number
}

const EMPTY_FILTERS: Filters = {
  project_id: '',
  fixed_version_id: '',
  tracker_id: '',
  assigned_to_id: '',
  author_id: '',
  scope: 'all',
}

function normalizeFilters(raw: Partial<Filters> | undefined): Filters {
  const scope = raw?.scope
  return {
    ...EMPTY_FILTERS,
    ...raw,
    scope: scope === 'assigned' || scope === 'authored' || scope === 'watched' ? scope : 'all',
  }
}

export function KanbanPage() {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [boards, setBoards] = useState<Board[]>([])
  const [boardId, setBoardId] = useState<number | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [columns, setColumns] = useState<ColumnData[]>([])
  const [uncovered, setUncovered] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Named[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [trackers, setTrackers] = useState<Named[]>([])
  const [users, setUsers] = useState<Named[]>([])
  const [versions, setVersions] = useState<Named[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftColumns, setDraftColumns] = useState<DraftColumn[]>([])
  const [savingColumns, setSavingColumns] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('我的看板')
  const [createOpen, setCreateOpen] = useState(false)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const dragRef = useRef<{ issueId: number; fromColumnId: number } | null>(null)
  const loadSeq = useRef(0)
  const skipSave = useRef(true)
  const board = boards.find((item) => item.id === boardId) ?? null

  useEffect(() => {
    void Promise.all([
      api<{ issue_statuses: Named[] }>('/issue_statuses.json'),
      api<{ projects: Project[] }>('/projects.json?limit=100'),
      api<{ trackers: Named[] }>('/trackers.json'),
      api<{ users: Named[] }>('/studio/user_names'),
    ]).then(([statusRes, projectRes, trackerRes, userRes]) => {
      setStatuses(statusRes.issue_statuses ?? [])
      setProjects(projectRes.projects ?? [])
      setTrackers(trackerRes.trackers ?? [])
      setUsers(userRes.users ?? [])
    })
  }, [])

  function applyBoard(next: Board) {
    skipSave.current = true
    setBoardId(next.id)
    setFilters(normalizeFilters(next.filters))
    setGroupBy(next.group_by || 'none')
    setColumns([])
  }

  function loadBoards(selectId?: number) {
    return api<{ boards: Board[] }>('/studio/kanban_boards').then((res) => {
      const list = res.boards ?? []
      setBoards(list)
      const chosen = list.find((item) => item.id === (selectId ?? boardId)) ?? list[0]
      if (chosen) applyBoard(chosen)
      else {
        setBoardId(null)
        setLoading(false)
      }
      return list
    })
  }

  useEffect(() => {
    setLoading(true)
    void loadBoards().catch((err: Error) => {
      setError(err.message)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!filters.project_id) {
      setVersions([])
      return
    }
    void api<{ versions: Named[] }>(`/projects/${filters.project_id}/versions.json`)
      .then((res) => setVersions(res.versions ?? []))
      .catch(() => setVersions([]))
  }, [filters.project_id])

  useEffect(() => {
    if (!boardId) return
    const seq = ++loadSeq.current
    let cancelled = false
    setLoading(true)
    void api<{ uncovered: number; columns: ColumnData[] }>(issuesPath(boardId, filters))
      .then((res) => {
        if (cancelled || seq !== loadSeq.current) return
        setColumns(res.columns ?? [])
        setUncovered(res.uncovered ?? 0)
        setError(null)
      })
      .catch((err: Error) => {
        if (!cancelled && seq === loadSeq.current) setError(err.message)
      })
      .finally(() => {
        if (!cancelled && seq === loadSeq.current) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [boardId, filters, groupBy])

  useEffect(() => {
    if (!boardId) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    const handle = window.setTimeout(() => {
      void api(`/studio/kanban_boards/${boardId}`, {
        method: 'PATCH',
        body: { filters, group_by: groupBy },
      }).catch((err: Error) => setError(err.message))
    }, 400)
    return () => window.clearTimeout(handle)
  }, [boardId, filters, groupBy])

  function patchFilters(patch: Partial<Filters>) {
    setFilters((current) => {
      const next = { ...current, ...patch }
      if (patch.project_id !== undefined && patch.project_id !== current.project_id) next.fixed_version_id = ''
      return next
    })
  }

  async function createBoard() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await api<{ board: Board }>('/studio/kanban_boards', { method: 'POST', body: { name } })
      setBoards((current) => [...current, res.board])
      applyBoard(res.board)
      setCreateOpen(false)
      setNewName('我的看板')
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  function openEditor() {
    if (!board) return
    setDraftName(board.name)
    setDraftColumns(
      board.columns.flatMap((column) => {
        const ids = column.status_ids.length ? column.status_ids : [column.target_status_id]
        return ids.map((id) => ({
          name: statuses.find((status) => status.id === id)?.name ?? column.name,
          section_name: column.section_name ?? '',
          status_ids: [id],
          target_status_id: id,
        }))
      }),
    )
    setEditorOpen(true)
  }

  function chooseStatus(index: number, statusId: number) {
    const status = statuses.find((item) => item.id === statusId)
    if (!status) return
    setDraftColumns((current) =>
      current.map((column, columnIndex) =>
        columnIndex === index
          ? { ...column, name: status.name, status_ids: [statusId], target_status_id: statusId }
          : column,
      ),
    )
  }

  function updateDraft(index: number, patch: Partial<DraftColumn>) {
    setDraftColumns((current) =>
      current.map((column, columnIndex) => {
        if (columnIndex !== index) return column
        const next = { ...column, ...patch }
        if (patch.status_ids && !patch.status_ids.includes(next.target_status_id)) {
          next.target_status_id = patch.status_ids[0] ?? next.target_status_id
        }
        return next
      }),
    )
  }

  function addDraftColumn() {
    const used = new Set(draftColumns.flatMap((column) => column.status_ids))
    const status = statuses.find((item) => !used.has(item.id))
    if (!status) return
    setDraftColumns((current) => [
      ...current,
      { name: status.name, section_name: '', status_ids: [status.id], target_status_id: status.id },
    ])
  }

  async function saveColumns() {
    if (!board) return
    setSavingColumns(true)
    setError(null)
    try {
      const res = await api<{ board: Board }>(`/studio/kanban_boards/${board.id}`, {
        method: 'PATCH',
        body: { name: draftName.trim(), columns: draftColumns },
      })
      setBoards((current) => current.map((item) => (item.id === res.board.id ? { ...item, ...res.board, filters, group_by: groupBy } : item)))
      setEditorOpen(false)
      skipSave.current = true
      setBoardId(res.board.id)
      setFilters({ ...filters })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingColumns(false)
    }
  }

  async function removeBoard() {
    if (!board) return
    const ok = await confirm({ title: `删除看板「${board.name}」`, description: '只删除这块看板的配置，工单不会被删除。' })
    if (!ok) return
    try {
      await api(`/studio/kanban_boards/${board.id}`, { method: 'DELETE' })
      const rest = boards.filter((item) => item.id !== board.id)
      setBoards(rest)
      if (rest[0]) applyBoard(rest[0])
      else setBoardId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  async function loadMore(column: ColumnData) {
    if (!boardId) return
    const res = await api<{ columns: ColumnData[] }>(
      issuesPath(boardId, filters, { columnId: column.id, offset: column.issues.length }),
    )
    const next = res.columns?.[0]
    if (!next) return
    setColumns((current) =>
      current.map((item) =>
        item.id === column.id ? { ...item, total: next.total, issues: [...item.issues, ...next.issues] } : item,
      ),
    )
  }

  function relocateCard(issueId: number, fromColumnId: number, toColumnId: number, targetStatusId: number) {
    let moved: Card | undefined
    const next = columns.map((column) => {
      if (column.id !== fromColumnId) return column
      moved = column.issues.find((issue) => issue.id === issueId)
      return {
        ...column,
        total: Math.max(0, column.total - (moved ? 1 : 0)),
        issues: column.issues.filter((issue) => issue.id !== issueId),
      }
    }).map((column) => {
      if (column.id !== toColumnId || !moved) return column
      const status = statuses.find((item) => item.id === targetStatusId)
      const card = status ? { ...moved, status: { id: status.id, name: status.name } } : moved
      return { ...column, total: column.total + 1, issues: [card, ...column.issues.filter((issue) => issue.id !== issueId)] }
    })
    return { next, moved }
  }

  async function dropOn(columnId: number) {
    const drag = dragRef.current
    dragRef.current = null
    setDragOver(null)
    setDraggingId(null)
    if (!drag || drag.fromColumnId === columnId || !board) return
    const target = board.columns.find((column) => column.id === columnId)
    if (!target) return
    const { next, moved } = relocateCard(drag.issueId, drag.fromColumnId, columnId, target.target_status_id)
    if (!moved) return
    const snapshot = columns
    loadSeq.current += 1
    setColumns(next)
    try {
      await api(`/issues/${drag.issueId}.json`, {
        method: 'PUT',
        body: { issue: { status_id: target.target_status_id } },
      })
    } catch (err) {
      setColumns(snapshot)
      setError(err instanceof Error ? err.message : '工作流不允许改到这个状态')
    }
  }

  const usedByOthers = (index: number) => new Set(draftColumns.filter((_, i) => i !== index).flatMap((column) => column.status_ids))
  const boardTotal = useMemo(() => columns.reduce((sum, column) => sum + column.total, 0), [columns])
  const showProject = !filters.project_id

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] min-h-[640px] flex-col bg-[#eef0f4] p-4 md:-m-6 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {board ? (
            <Select
              className="!w-auto min-w-40 !border-transparent !bg-transparent !px-1 !py-1 !text-lg !font-semibold !text-slate-900 !shadow-none !ring-0 focus:!ring-0"
              value={String(board.id)}
              onChange={(e) => {
                const next = boards.find((item) => item.id === Number(e.target.value))
                if (next) applyBoard(next)
              }}
            >
              {boards.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          ) : (
            <h1 className="text-lg font-semibold text-slate-900">还没有看板</h1>
          )}
          {board ? (
            <span className="hidden rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200/80 sm:inline-flex">
              {boardTotal} 张工单
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="!px-3 !py-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            新建看板
          </Button>
          <Button variant="secondary" className="!px-3 !py-1.5" disabled={!board} onClick={openEditor}>
            <Settings2 className="h-3.5 w-3.5" />
            编辑列
          </Button>
          <Button variant="ghost" className="!px-3 !py-1.5 text-slate-500" disabled={!board} onClick={() => void removeBoard()}>
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      </div>
      {board ? (
        <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-200/80">
          <FilterField label="范围" active={filters.scope !== 'all'}>
            <Select className={filterSelectClass('!w-28', filters.scope !== 'all')} value={filters.scope} onChange={(e) => patchFilters({ scope: e.target.value as Scope })}>
              <option value="all">全部工单</option>
              <option value="assigned">指派给我</option>
              <option value="authored">我创建的</option>
              <option value="watched">我跟踪的</option>
            </Select>
          </FilterField>
          <FilterField label="项目" active={Boolean(filters.project_id)}>
            <Select className={filterSelectClass('!w-36', Boolean(filters.project_id))} value={filters.project_id} onChange={(e) => patchFilters({ project_id: e.target.value })}>
              <option value="">全部项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="版本" active={Boolean(filters.fixed_version_id)}>
            <Select className={filterSelectClass('!w-32', Boolean(filters.fixed_version_id))} value={filters.fixed_version_id} onChange={(e) => patchFilters({ fixed_version_id: e.target.value })} disabled={!filters.project_id}>
              <option value="">全部版本</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>{version.name}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="跟踪标签" active={Boolean(filters.tracker_id)}>
            <Select className={filterSelectClass('!w-28', Boolean(filters.tracker_id))} value={filters.tracker_id} onChange={(e) => patchFilters({ tracker_id: e.target.value })}>
              <option value="">全部</option>
              {trackers.map((tracker) => (
                <option key={tracker.id} value={tracker.id}>{tracker.name}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="指派给" active={Boolean(filters.assigned_to_id)}>
            <Select className={filterSelectClass('!w-28', Boolean(filters.assigned_to_id))} value={filters.assigned_to_id} onChange={(e) => patchFilters({ assigned_to_id: e.target.value })}>
              <option value="">全部</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="作者" active={Boolean(filters.author_id)}>
            <Select className={filterSelectClass('!w-28', Boolean(filters.author_id))} value={filters.author_id} onChange={(e) => patchFilters({ author_id: e.target.value })}>
              <option value="">全部</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="分组" active={groupBy !== 'none'}>
            <Select className={filterSelectClass('!w-28', groupBy !== 'none')} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              <option value="none">不分组</option>
              <option value="assigned_to">按指派给</option>
              <option value="tracker">按跟踪标签</option>
              <option value="version">按目标版本</option>
            </Select>
          </FilterField>
        </div>
      ) : null}
      {error ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {uncovered > 0 ? (
        <p className="mb-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          有 {uncovered} 张单的状态不在看板上，未显示。
        </p>
      ) : null}
      {!board && !loading ? <EmptyState title="还没有看板" description="新建一块看板后，会按当前工单状态各生成一列。" /> : null}
      {loading && columns.length === 0 && board ? <Spinner /> : null}
      {board ? (
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]">
          <div className="flex h-full items-stretch gap-3">
            {sectionGroups(board.columns).map((section, sectionIndex) => {
              const tone = SECTION_TONES[sectionIndex % SECTION_TONES.length]
              const total = section.columns.reduce((sum, definition) => sum + (columns.find((column) => column.id === definition.id)?.total ?? 0), 0)
              return (
                <div
                  key={section.columns.map((column) => column.id).join('-')}
                  className={cn(
                    'flex h-full shrink-0 flex-col rounded-2xl px-2 pb-2 pt-1.5',
                    section.title ? cn('border', tone.frame) : 'bg-transparent',
                  )}
                >
                  <div className="mb-1.5 flex h-6 items-center gap-2 px-1">
                    {section.title ? (
                      <>
                        <span className={cn('h-2 w-2 rounded-full', tone.tick)} />
                        <h2 className={cn('text-[13px] font-semibold tracking-wide', tone.title)}>{section.title}</h2>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', tone.count)}>{total}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex min-h-0 flex-1 gap-2.5">
                    {section.columns.map((definition) => {
                      const data = columns.find((column) => column.id === definition.id)
                      const cards = data?.issues ?? []
                      const groups = groupCards(cards, groupBy)
                      const over = dragOver === definition.id
                      const statusName = statuses.find((status) => status.id === definition.target_status_id)?.name || definition.name
                      const stage = statusTone(statusName)
                      return (
                        <section
                          key={definition.id}
                          className={cn(
                            'flex h-full w-[268px] shrink-0 flex-col rounded-xl transition',
                            over ? 'bg-blue-50 ring-2 ring-blue-400' : 'bg-white/70 ring-1 ring-slate-200/70',
                          )}
                          onDragOver={(event) => {
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                            setDragOver(definition.id)
                          }}
                          onDragLeave={() => setDragOver((current) => (current === definition.id ? null : current))}
                          onDrop={(event) => {
                            event.preventDefault()
                            void dropOn(definition.id)
                          }}
                        >
                          <header className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', stage.dot)} />
                            <h3 className="min-w-0 truncate text-[13px] font-semibold text-slate-800">{statusName}</h3>
                            <span className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
                              {data?.total ?? 0}
                            </span>
                          </header>
                          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2.5 [scrollbar-width:thin]">
                            {loading && cards.length === 0 ? (
                              <div className="flex flex-1 items-center justify-center text-xs text-slate-400">加载中…</div>
                            ) : cards.length === 0 ? (
                              <div className={cn(
                                'flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs',
                                over ? 'border-blue-400 bg-blue-50/80 font-medium text-blue-700' : 'border-slate-200 text-slate-400',
                              )}>
                                {over ? `放到「${statusName}」` : '暂无工单'}
                              </div>
                            ) : null}
                            {groups.map((group) => (
                              <div key={group.label || 'all'} className="space-y-2">
                                {group.label ? (
                                  <p className="px-1 pt-1 text-[11px] font-semibold tracking-wide text-slate-400">{group.label}</p>
                                ) : null}
                                {group.cards.map((card) => (
                                  <KanbanCard
                                    key={card.id}
                                    card={card}
                                    dragging={draggingId === card.id}
                                    showProject={showProject}
                                    onDragStart={(event) => {
                                      dragRef.current = { issueId: card.id, fromColumnId: definition.id }
                                      setDraggingId(card.id)
                                      event.dataTransfer.effectAllowed = 'move'
                                      event.dataTransfer.setData('text/plain', String(card.id))
                                    }}
                                    onDragEnd={() => {
                                      setDraggingId(null)
                                      setDragOver(null)
                                    }}
                                    onOpen={() => setOpenId(card.id)}
                                  />
                                ))}
                              </div>
                            ))}
                            {data && data.issues.length < data.total ? (
                              <button type="button" className="rounded-lg py-1.5 text-xs font-medium text-blue-600 hover:bg-white" onClick={() => void loadMore(data)}>
                                还有 {data.total - data.issues.length} 条
                              </button>
                            ) : null}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <DialogTitle className="mb-3 text-lg font-semibold">新建看板</DialogTitle>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="看板名称" />
            <p className="mt-2 text-sm text-gray-500">会按当前工单状态的顺序，每个状态生成一列。</p>
            <div className="mt-4 flex gap-2">
              <Button disabled={creating || !newName.trim()} onClick={() => void createBoard()}>{creating ? '创建中…' : '创建'}</Button>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>取消</Button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={editorOpen} onClose={() => { if (!savingColumns) setEditorOpen(false) }} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="max-h-[86vh] w-[min(760px,100%)] overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <DialogTitle className="text-lg font-semibold">编辑列</DialogTitle>
            <p className="mt-1 text-sm text-gray-500">每一列只对应一个工单状态，列名就是状态名。一级标题可留空，相邻列填同一个名字会合成一个区域。</p>
            <Input className="mt-3" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="看板名称" />
            <div className="mt-4 space-y-3">
              {draftColumns.map((column, index) => {
                const taken = usedByOthers(index)
                return (
                  <div key={index} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input className="!w-40" value={column.section_name} placeholder="一级标题，可留空" onChange={(e) => updateDraft(index, { section_name: e.target.value })} />
                      <Select
                        className="!w-40"
                        value={String(column.target_status_id)}
                        onChange={(e) => chooseStatus(index, Number(e.target.value))}
                      >
                        {statuses.map((status) => (
                          <option key={status.id} value={status.id} disabled={taken.has(status.id)}>
                            {status.name}
                          </option>
                        ))}
                      </Select>
                      <button type="button" className="text-sm text-gray-500" disabled={index === 0} onClick={() => setDraftColumns((current) => swap(current, index, index - 1))}>上移</button>
                      <button type="button" className="text-sm text-gray-500" disabled={index === draftColumns.length - 1} onClick={() => setDraftColumns((current) => swap(current, index, index + 1))}>下移</button>
                      <button
                        type="button"
                        className="text-sm text-red-600 disabled:text-gray-300"
                        disabled={draftColumns.length <= 1}
                        onClick={() => setDraftColumns((current) => current.filter((_, columnIndex) => columnIndex !== index))}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" disabled={statuses.every((status) => draftColumns.some((column) => column.status_ids.includes(status.id)))} onClick={addDraftColumn}>
                添加列
              </Button>
              <Button disabled={savingColumns || !draftName.trim()} onClick={() => void saveColumns()}>{savingColumns ? '保存中…' : '保存'}</Button>
              <Button variant="secondary" onClick={() => setEditorOpen(false)}>取消</Button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {confirmDialog}
      <IssueDrawer issueId={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} onUpdated={() => setFilters((current) => ({ ...current }))} />
    </div>
  )
}

function issuesPath(boardId: number, filters: Filters, extra?: { columnId?: number; offset?: number }) {
  const qs = new URLSearchParams({
    project_id: filters.project_id,
    fixed_version_id: filters.project_id ? filters.fixed_version_id : '',
    tracker_id: filters.tracker_id,
    assigned_to_id: filters.assigned_to_id,
    author_id: filters.author_id,
    scope: filters.scope,
  })
  if (extra?.columnId) qs.set('column_id', String(extra.columnId))
  if (extra?.offset) qs.set('offset', String(extra.offset))
  return `/studio/kanban_boards/${boardId}/issues?${qs}`
}

function sectionGroups(columns: BoardColumn[]) {
  const groups: Array<{ title: string; columns: BoardColumn[] }> = []
  for (const column of columns) {
    const title = column.section_name?.trim() ?? ''
    const last = groups[groups.length - 1]
    if (last && last.title === title) last.columns.push(column)
    else groups.push({ title, columns: [column] })
  }
  return groups
}

const SECTION_TONES = [
  { frame: 'border-slate-300/90 bg-slate-200/55', tick: 'bg-slate-700', title: 'text-slate-800', count: 'bg-white text-slate-600 ring-1 ring-slate-200' },
  { frame: 'border-blue-300/80 bg-blue-100/55', tick: 'bg-blue-600', title: 'text-blue-950', count: 'bg-white text-blue-700 ring-1 ring-blue-100' },
  { frame: 'border-emerald-300/80 bg-emerald-100/45', tick: 'bg-emerald-600', title: 'text-emerald-950', count: 'bg-white text-emerald-700 ring-1 ring-emerald-100' },
  { frame: 'border-amber-300/80 bg-amber-100/45', tick: 'bg-amber-500', title: 'text-amber-950', count: 'bg-white text-amber-800 ring-1 ring-amber-100' },
  { frame: 'border-violet-300/80 bg-violet-100/50', tick: 'bg-violet-600', title: 'text-violet-950', count: 'bg-white text-violet-700 ring-1 ring-violet-100' },
]

const AVATAR_TONES = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-800',
]

function FilterField({ label, active, children }: { label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={cn('px-0.5 text-[11px] font-medium', active ? 'text-blue-600' : 'text-slate-400')}>{label}</span>
      {children}
    </label>
  )
}

function filterSelectClass(width: string, active: boolean) {
  return cn(width, '!py-1.5', active && '!border-blue-300 !bg-blue-50 !text-blue-800')
}

function KanbanCard({
  card,
  dragging,
  showProject,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  card: Card
  dragging: boolean
  showProject: boolean
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onOpen: () => void
}) {
  const tracker = trackerBadge(card.tracker?.name)
  const priority = priorityMeta(card.priority?.name)
  const time = cardTime(card)
  const assigned = card.assigned_to?.name
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'group cursor-grab rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:cursor-grabbing',
        priority?.accent ?? 'border-l-[3px] border-l-slate-200',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('inline-flex shrink-0 rounded px-1.5 py-px text-[11px] font-semibold leading-5 ring-1 ring-inset', tracker.className)}>
          {tracker.label}
        </span>
        <span className="truncate font-mono text-[11px] text-slate-400">#{card.id}</span>
        {priority ? (
          <span className={cn('ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none', priority.className)}>
            {priority.label}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-[1.35] text-slate-900">{card.subject}</p>
      {showProject && card.project?.name ? (
        <p className="mt-1 truncate text-[11px] text-slate-400">{card.project.name}{card.fixed_version?.name ? ` · ${card.fixed_version.name}` : ''}</p>
      ) : card.fixed_version?.name ? (
        <p className="mt-1 truncate text-[11px] text-slate-400">{card.fixed_version.name}</p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold', avatarTone(assigned))}>
            {initials(assigned)}
          </span>
          <span className={cn('truncate text-[11px]', assigned ? 'text-slate-600' : 'text-slate-400')}>
            {assigned || '未指派'}
          </span>
        </span>
        <span className={cn('shrink-0 text-[11px] tabular-nums', time.className)}>{time.label}</span>
      </div>
      {card.done_ratio && card.done_ratio > 0 && card.done_ratio < 100 ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${card.done_ratio}%` }} />
        </div>
      ) : null}
    </article>
  )
}

function trackerBadge(name?: string) {
  if (!name) return { label: '工单', className: 'bg-slate-100 text-slate-600 ring-slate-200' }
  if (/错误|缺陷|bug|故障/i.test(name)) return { label: name, className: 'bg-rose-100 text-rose-700 ring-rose-200' }
  if (/功能|需求|故事|story|feature/i.test(name)) return { label: name, className: 'bg-blue-100 text-blue-700 ring-blue-200' }
  if (/任务|task/i.test(name)) return { label: name, className: 'bg-slate-100 text-slate-600 ring-slate-200' }
  if (/支持|support/i.test(name)) return { label: name, className: 'bg-amber-50 text-amber-700 ring-amber-200' }
  return { label: name, className: 'bg-indigo-50 text-indigo-700 ring-indigo-200' }
}

function priorityMeta(name?: string) {
  if (!name || /普通|中等|Normal|Default/i.test(name)) return null
  if (/紧急|立刻|立即|Immediate|Urgent/i.test(name)) return { label: name, className: 'bg-red-50 text-red-700', accent: 'border-l-[3px] border-l-red-500' }
  if (/高|High/i.test(name)) return { label: name, className: 'bg-orange-50 text-orange-700', accent: 'border-l-[3px] border-l-orange-400' }
  if (/低|Low/i.test(name)) return { label: name, className: 'bg-slate-100 text-slate-500', accent: 'border-l-[3px] border-l-slate-300' }
  return { label: name, className: 'bg-blue-50 text-blue-700', accent: 'border-l-[3px] border-l-blue-500' }
}

function statusTone(name: string) {
  if (/完成|关闭|已关|Closed|Done|Resolved/i.test(name)) return { dot: 'bg-emerald-500' }
  if (/测试|QA|验收|Review/i.test(name)) return { dot: 'bg-violet-500' }
  if (/进行|开发|处理|Progress|Doing/i.test(name)) return { dot: 'bg-blue-500' }
  if (/新建|新|待|Open|New|Todo/i.test(name)) return { dot: 'bg-slate-400' }
  if (/阻塞|挂起|Hold|Block/i.test(name)) return { dot: 'bg-rose-500' }
  return { dot: 'bg-slate-400' }
}

function initials(name?: string) {
  const raw = name?.trim()
  if (!raw) return '?'
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 2 && /^[A-Za-z]/.test(parts[0]) && /^[A-Za-z]/.test(parts[1])) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return raw.slice(0, raw.charCodeAt(0) > 127 ? 1 : 2)
}

function avatarTone(name?: string) {
  if (!name) return 'bg-slate-100 text-slate-400'
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length
  return AVATAR_TONES[hash]
}

function cardTime(card: Card) {
  if (card.due_date) {
    const due = startOfDay(new Date(card.due_date))
    const today = startOfDay(new Date())
    const days = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (days < 0) return { label: `逾期 ${-days} 天`, className: 'font-semibold text-red-600' }
    if (days === 0) return { label: '今天到期', className: 'font-semibold text-amber-600' }
    if (days <= 3) return { label: `${days} 天后到期`, className: 'font-medium text-amber-600' }
    return { label: formatShortDate(card.due_date), className: 'text-slate-400' }
  }
  return { label: relativeTime(card.updated_on || card.created_on), className: 'text-slate-400' }
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatShortDate(value: string) {
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function relativeTime(value: string) {
  const date = new Date(value)
  const delta = Date.now() - date.getTime()
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return formatShortDate(value)
}

function swap<T>(list: T[], from: number, to: number) {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function groupCards(cards: Card[], groupBy: GroupBy) {
  if (groupBy === 'none') return [{ label: '', cards }]
  const map = new Map<string, Card[]>()
  for (const card of cards) {
    const label = groupBy === 'assigned_to'
      ? card.assigned_to?.name || '未指派'
      : groupBy === 'tracker'
        ? card.tracker?.name || '无跟踪标签'
        : card.fixed_version?.name || '未指定版本'
    const list = map.get(label) ?? []
    list.push(card)
    map.set(label, list)
  }
  return [...map.entries()].map(([label, group]) => ({ label, cards: group }))
}
