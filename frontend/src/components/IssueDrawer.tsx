import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Bold, Check, ChevronLeft, ChevronRight, Code, Files, Heading2, Image, Italic, Link2, List, ListOrdered, ListPlus, Plus, Quote, Strikethrough, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ClipboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { api, getApiKey, type Issue } from '../lib/api'
import { useConfirm } from './ConfirmDialog'
import { Button, Input, Select, Spinner, StatusBadge, Textarea } from './ui'
import { CustomFieldControl, defaultFieldValue, useIssueForm, type IssueCustomField } from '../pages/issues/IssueFormPage'

type JournalDetail = { property: string; name: string; old_value?: string | null; new_value?: string | null }
type Journal = {
  id: number
  notes?: string | null
  user: { name: string }
  created_on: string
  details?: JournalDetail[]
}
type Attachment = {
  id: number
  filename: string
  filesize: number
  content_type: string
  content_url: string
  thumbnail_url?: string
}
type Child = { id: number; subject: string; tracker?: { name: string } }
type IssueTemplateRow = {
  id: number
  name: string
  subject: string
  description: string
  tracker_id: number
  tracker_name?: string
  priority_id: number | null
}
type CustomField = { id: number; name: string; value?: string | string[] | null }
type Relation = { id: number; issue_id: number; issue_to_id: number; relation_type: string }
type Watcher = { id: number; name: string }

type StatusOption = { id: number; name: string; is_closed?: boolean }
type NamedOption = { id: number; name: string }

type IssueDetail = Issue & {
  custom_fields?: CustomField[]
  attachments?: Attachment[]
  journals?: Journal[]
  children?: Child[]
  relations?: Relation[]
  watchers?: Watcher[]
  closed_on?: string | null
  attributes_editable?: boolean
  notes_addable?: boolean
  allowed_statuses?: StatusOption[]
}

type EditState = {
  subject: string
  description: string
  tracker_id: string
  status_id: string
  assigned_to_id: string
  priority_id: string
  fixed_version_id: string
  parent_issue_id: string
  estimated_hours: string
  start_date: string
  due_date: string
  done_ratio: string
  custom_values: Record<number, string | string[]>
}

const ATTR_LABEL: Record<string, string> = {
  status_id: '状态',
  tracker_id: '跟踪标签',
  priority_id: '优先级',
  assigned_to_id: '指派给',
  fixed_version_id: '目标版本',
  category_id: '类别',
  subject: '主题',
  description: '描述',
  start_date: '开始日期',
  due_date: '完成日期',
  done_ratio: '完成百分比',
  estimated_hours: '预估工作量',
  parent_id: '父单',
  child_id: '子单',
  project_id: '项目',
  is_private: '私有',
}

const PICK_PAGE_SIZE = 10

const RELATION_LABEL: Record<string, string> = {
  relates: '关联到',
  duplicates: '重复',
  duplicated: '被重复',
  blocks: '阻塞',
  blocked: '被阻塞',
  precedes: '前置于',
  follows: '跟随',
  copied_to: '复制到',
  copied_from: '复制自',
}

function dash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function sanitizeHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

function otherIssueId(relation: Relation, currentId: number) {
  return relation.issue_id === currentId ? relation.issue_to_id : relation.issue_id
}

function clipboardImageFiles(data: DataTransfer) {
  const files: File[] = []
  for (const item of data.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (!files.length) {
    for (const file of data.files) {
      if (file.type.startsWith('image/')) files.push(file)
    }
  }
  return files
}

async function uploadImageFile(file: File) {
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
  const filename = `clipboard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
  const key = getApiKey()
  const res = await fetch('/uploads.json?filename=' + encodeURIComponent(filename), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(key ? { 'X-Redmine-API-Key': key } : {}),
    },
    body: file,
  })
  if (!res.ok) throw new Error('图片上传失败')
  const data = (await res.json()) as { upload: { token: string } }
  return { token: data.upload.token, filename, content_type: file.type || 'image/png' }
}

function insertAt(value: string, start: number, end: number, insert: string) {
  return value.slice(0, start) + insert + value.slice(end)
}

function imageMarkup(filename: string) {
  return `![](${filename})`
}

function withKey(url: string) {
  const key = getApiKey()
  if (!key || !url) return url
  const next = new URL(url, window.location.origin)
  next.searchParams.set('key', key)
  return next.pathname + next.search
}

function renderInline(text: string, attachments: Attachment[], key: { n: number }, onOpenImage?: (filename: string) => void): ReactNode[] {
  const byName = new Map(attachments.map((file) => [file.filename, file]))
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*/g
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const id = key.n++
    if (match[0].startsWith('![')) {
      const filename = decodeURIComponent(match[2])
      const file = byName.get(filename) ?? byName.get(match[2])
      const src = file ? withKey(file.content_url) : match[2].startsWith('http') ? match[2] : ''
      nodes.push(
        src ? (
          <img
            key={id}
            src={src}
            alt={match[1] || file?.filename || ''}
            className="my-2 max-h-80 max-w-full cursor-zoom-in rounded border border-gray-200"
            onClick={(event) => {
              event.stopPropagation()
              if (file) onOpenImage?.(file.filename)
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span key={id}>{match[0]}</span>
        ),
      )
    } else if (match[3] !== undefined) {
      nodes.push(
        <a key={id} href={match[4]} target="_blank" rel="noreferrer" className="text-blue-600 underline">
          {match[3]}
        </a>,
      )
    } else if (match[5] !== undefined) {
      nodes.push(<strong key={id}>{match[5]}</strong>)
    } else if (match[6] !== undefined) {
      nodes.push(<del key={id}>{match[6]}</del>)
    } else if (match[7] !== undefined) {
      nodes.push(
        <code key={id} className="rounded bg-gray-100 px-1 text-[0.9em]">
          {match[7]}
        </code>,
      )
    } else if (match[8] !== undefined) {
      nodes.push(<em key={id}>{match[8]}</em>)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function isMarkdownBlock(line: string) {
  return line.startsWith('```') || /^#{1,3} /.test(line) || line.startsWith('> ') || /^[-*] /.test(line) || /^\d+\. /.test(line)
}

function RichText({ text, attachments, onOpenImage }: { text: string; attachments: Attachment[]; onOpenImage?: (filename: string) => void }) {
  const key = { n: 0 }
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.startsWith('```')) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(
        <pre key={key.n++} className="my-2 overflow-x-auto rounded bg-gray-100 p-2 text-xs">
          {code.join('\n')}
        </pre>,
      )
      continue
    }
    const heading = line.match(/^(#{1,3}) (.+)$/)
    if (heading) {
      const Tag = heading[1].length === 1 ? 'h2' : heading[1].length === 2 ? 'h3' : 'h4'
      blocks.push(
        <Tag key={key.n++} className="my-1 font-semibold">
          {renderInline(heading[2], attachments, key, onOpenImage)}
        </Tag>,
      )
      index += 1
      continue
    }
    if (line.startsWith('> ')) {
      blocks.push(
        <blockquote key={key.n++} className="my-1 border-l-2 border-gray-300 pl-3 text-gray-600">
          {renderInline(line.slice(2), attachments, key, onOpenImage)}
        </blockquote>,
      )
      index += 1
      continue
    }
    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*] /.test(lines[index])) {
        items.push(lines[index].replace(/^[-*] /, ''))
        index += 1
      }
      blocks.push(
        <ul key={key.n++} className="my-1 list-disc pl-5">
          {items.map((item) => (
            <li key={key.n++}>{renderInline(item, attachments, key, onOpenImage)}</li>
          ))}
        </ul>,
      )
      continue
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\. /.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\. /, ''))
        index += 1
      }
      blocks.push(
        <ol key={key.n++} className="my-1 list-decimal pl-5">
          {items.map((item) => (
            <li key={key.n++}>{renderInline(item, attachments, key, onOpenImage)}</li>
          ))}
        </ol>,
      )
      continue
    }
    if (line.trim() === '') {
      index += 1
      continue
    }
    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() !== '' && !isMarkdownBlock(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(
      <p key={key.n++} className="my-1">
        {paragraph.map((item, itemIndex) => (
          <span key={key.n++}>
            {itemIndex > 0 ? <br /> : null}
            {renderInline(item, attachments, key, onOpenImage)}
          </span>
        ))}
      </p>,
    )
  }
  return <div className="text-sm leading-6 text-gray-800">{blocks}</div>
}

function ImageLightbox({
  images,
  index,
  onClose,
  onChange,
}: {
  images: Array<{ id: number; src: string; name: string }>
  index: number
  onClose: () => void
  onChange: (index: number) => void
}) {
  const current = images[index]
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      } else if (event.key === 'ArrowLeft' && images.length > 1) {
        onChange((index - 1 + images.length) % images.length)
      } else if (event.key === 'ArrowRight' && images.length > 1) {
        onChange((index + 1) % images.length)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [images.length, index, onClose, onChange])

  if (!current) return null
  return (
    <div className="fixed inset-0 z-[90] bg-black/75" onClick={onClose}>
      <button type="button" aria-label="关闭" className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70" onClick={onClose}>
        <X className="h-5 w-5" />
      </button>
      {images.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="上一张"
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            onClick={(event) => {
              event.stopPropagation()
              onChange((index - 1 + images.length) % images.length)
            }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="下一张"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            onClick={(event) => {
              event.stopPropagation()
              onChange((index + 1) % images.length)
            }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}
      <div className="pointer-events-none flex h-full items-center justify-center px-16 pb-28 pt-14">
        <img
          src={current.src}
          alt={current.name}
          className="pointer-events-auto max-h-[82vh] max-w-[92vw] object-contain"
          style={{ height: '82vh', width: 'auto' }}
          onClick={(event) => event.stopPropagation()}
        />
      </div>
      <div className="absolute bottom-4 left-4 flex max-w-[calc(100vw-2rem)] gap-3 overflow-x-auto" onClick={(event) => event.stopPropagation()}>
        {images.map((image, imageIndex) => (
          <button key={image.id} type="button" className="w-28 shrink-0 text-left" onClick={() => onChange(imageIndex)}>
            <img
              src={image.src}
              alt={image.name}
              className={`h-16 w-full rounded border-2 object-cover ${imageIndex === index ? 'border-blue-500' : 'border-transparent'}`}
            />
            <div className="mt-1 truncate text-xs text-white">{image.name}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 py-1.5 text-sm">
      <div className="text-gray-500">{label}</div>
      <div className="min-w-0 break-words text-gray-900">{value}</div>
    </div>
  )
}

function editFromIssue(issue: IssueDetail, fields: IssueCustomField[]): EditState {
  const custom_values: Record<number, string | string[]> = {}
  for (const field of fields) custom_values[field.id] = defaultFieldValue(field)
  return {
    subject: issue.subject,
    description: issue.description ?? '',
    tracker_id: String(issue.tracker?.id ?? ''),
    status_id: String(issue.status?.id ?? ''),
    assigned_to_id: issue.assigned_to ? String(issue.assigned_to.id) : '',
    priority_id: issue.priority ? String(issue.priority.id) : '',
    fixed_version_id: issue.fixed_version ? String(issue.fixed_version.id) : '',
    parent_issue_id: issue.parent?.id ? String(issue.parent.id) : '',
    estimated_hours: issue.estimated_hours == null ? '' : String(issue.estimated_hours),
    start_date: issue.start_date ?? '',
    due_date: issue.due_date ?? '',
    done_ratio: String(issue.done_ratio ?? 0),
    custom_values,
  }
}

export function IssueDrawer({
  issueId,
  onClose,
  onOpen,
  onUpdated,
  layout = 'drawer',
}: {
  issueId: number | null
  onClose: () => void
  onOpen?: (id: number) => void
  onUpdated?: () => void
  layout?: 'drawer' | 'page'
}) {
  const { openCreate, savedTick } = useIssueForm()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [issue, setIssue] = useState<IssueDetail | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [assignees, setAssignees] = useState<NamedOption[]>([])
  const [versions, setVersions] = useState<NamedOption[]>([])
  const [priorities, setPriorities] = useState<NamedOption[]>([])
  const [trackers, setTrackers] = useState<NamedOption[]>([])
  const [customFieldDefs, setCustomFieldDefs] = useState<IssueCustomField[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [statusNames, setStatusNames] = useState<Record<string, string>>({})
  const [fieldFormats, setFieldFormats] = useState<Record<number, string>>({})
  const savedKey = useRef('')
  const editRef = useRef<EditState | null>(null)
  const pasting = useRef(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [detailTab, setDetailTab] = useState<'description' | 'attachments' | 'children' | 'relations' | 'activity' | 'watchers'>('description')
  const [childTool, setChildTool] = useState<null | 'pick' | 'template'>(null)
  const [pickQuery, setPickQuery] = useState('')
  const [pickPage, setPickPage] = useState(0)
  const [pickTotal, setPickTotal] = useState(0)
  const [pickIssues, setPickIssues] = useState<Issue[]>([])
  const [pickSelected, setPickSelected] = useState<number[]>([])
  const [pickLoading, setPickLoading] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const [pickSaving, setPickSaving] = useState(false)
  const [templates, setTemplates] = useState<IssueTemplateRow[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', description: '', tracker_id: '', priority_id: '' })
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const descriptionBaseline = useRef('')
  const [toast, setToast] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const toastTimer = useRef<number | null>(null)
  editRef.current = edit

  function flash(message: string) {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1600)
  }

  function editKey(state: EditState) {
    return JSON.stringify({
      subject: state.subject,
      description: state.description,
      tracker_id: state.tracker_id,
      status_id: state.status_id,
      assigned_to_id: state.assigned_to_id,
      priority_id: state.priority_id,
      fixed_version_id: state.fixed_version_id,
      parent_issue_id: state.parent_issue_id,
      estimated_hours: state.estimated_hours,
      start_date: state.start_date,
      due_date: state.due_date,
      done_ratio: state.done_ratio,
      custom_values: state.custom_values,
    })
  }
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('studio_issue_sidebar_width'))
    return Number.isFinite(saved) && saved >= 240 && saved <= 640 ? saved : 288
  })

  async function load(id: number) {
    setError(null)
    const data = await api<{ issue: IssueDetail }>(
      `/issues/${id}.json?include=attachments,journals,children,relations,watchers,allowed_statuses`,
    )
    const next = data.issue
    const fieldQuery = next.project?.id && next.tracker?.id
      ? api<{ fields: IssueCustomField[] }>(
          `/studio/issue_fields?project_id=${next.project.id}&tracker_id=${next.tracker.id}&issue_id=${next.id}`,
        ).catch(() => ({ fields: [] as IssueCustomField[] }))
      : Promise.resolve({ fields: [] as IssueCustomField[] })
    const [memberRes, versionRes, priorityRes, statusRes, userRes, columnRes, trackerRes, fieldRes, configRes] = await Promise.all([
      next.project?.id
        ? api<{ memberships: Array<{ user?: NamedOption }> }>(`/projects/${next.project.id}/memberships.json`)
        : Promise.resolve({ memberships: [] }),
      next.project?.id
        ? api<{ versions: NamedOption[] }>(`/projects/${next.project.id}/versions.json`)
        : Promise.resolve({ versions: [] }),
      api<{ issue_priorities: NamedOption[] }>('/enumerations/IssuePriority.json'),
      api<{ issue_statuses: NamedOption[] }>('/issue_statuses.json'),
      api<{ users: Array<{ id: number; name: string }> }>('/studio/user_names').catch(() => ({ users: [] })),
      next.project?.id
        ? api<{ fields: Array<{ id: number; field_format: string }> }>(`/studio/issue_columns?project_id=${next.project.id}`).catch(() => ({ fields: [] }))
        : Promise.resolve({ fields: [] }),
      api<{ trackers: NamedOption[] }>('/trackers.json').catch(() => ({ trackers: [] })),
      fieldQuery,
      next.project?.id
        ? api<{ priorities: Array<{ id: number; enabled: boolean }>; trackers: Array<{ id: number; enabled: boolean }> }>(`/studio/projects/${next.project.id}/configuration`).catch(() => null)
        : Promise.resolve(null),
    ])
    const people = (memberRes.memberships ?? []).flatMap((item) => (item.user ? [item.user] : []))
    if (next.assigned_to && !people.some((user) => user.id === next.assigned_to?.id)) {
      people.unshift(next.assigned_to)
    }
    const fields = fieldRes.fields ?? []
    const nextEdit = editFromIssue(next, fields)
    setIssue(next)
    setCustomFieldDefs(fields)
    setEdit(nextEdit)
    savedKey.current = editKey(nextEdit)
    const enabledTrackers = new Set((configRes?.trackers ?? []).filter((item) => item.enabled).map((item) => item.id))
    const trackerList = trackerRes.trackers ?? []
    setTrackers(enabledTrackers.size ? trackerList.filter((item) => enabledTrackers.has(item.id) || item.id === next.tracker?.id) : trackerList)
    setAssignees(people)
    setVersions(versionRes.versions ?? [])
    const enabledPriorities = new Set((configRes?.priorities ?? []).filter((item) => item.enabled).map((item) => item.id))
    const priorityList = priorityRes.issue_priorities ?? []
    setPriorities(enabledPriorities.size && configRes?.priorities?.some((item) => !item.enabled) ? priorityList.filter((item) => enabledPriorities.has(item.id) || item.id === next.priority?.id) : priorityList)
    setStatusNames(Object.fromEntries((statusRes.issue_statuses ?? []).map((status) => [String(status.id), status.name])))
    const names: Record<string, string> = {}
    for (const user of userRes.users ?? []) names[String(user.id)] = user.name
    for (const user of people) names[String(user.id)] = user.name
    setUserNames(names)
    setFieldFormats(Object.fromEntries((columnRes.fields ?? []).map((field) => [field.id, field.field_format])))
  }

  useEffect(() => {
    if (!issueId) {
      setIssue(null)
      return
    }
    setNote('')
    setEditingDescription(false)
    setDetailTab('description')
    setChildTool(null)
    setPreviewIndex(null)
    void load(issueId).catch((e: Error) => setError(e.message))
  }, [issueId])

  const savedTickSeen = useRef<number | null>(null)
  useEffect(() => {
    if (savedTickSeen.current === null) {
      savedTickSeen.current = savedTick
      return
    }
    if (savedTickSeen.current === savedTick || !issueId) return
    savedTickSeen.current = savedTick
    void load(issueId)
      .then(() => onUpdated?.())
      .catch((e: Error) => setError(e.message))
  }, [issueId, onUpdated, savedTick])

  useEffect(() => {
    if (childTool !== 'pick' || !issue?.project?.id) return
    const projectId = issue.project.id
    const currentId = issue.id
    const skip = new Set<number>([currentId, ...(issue.parent?.id ? [issue.parent.id] : []), ...(issue.children ?? []).map((child) => child.id)])
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams({
        project_id: String(projectId),
        status_id: '*',
        limit: String(PICK_PAGE_SIZE),
        offset: String(pickPage * PICK_PAGE_SIZE),
        sort: 'updated_on:desc',
      })
      const query = pickQuery.trim()
      if (/^\d+$/.test(query)) params.set('issue_id', query)
      else if (query) params.set('subject', `~${query.replace(/\|/g, '')}`)
      setPickLoading(true)
      setPickError(null)
      void api<{ issues: Issue[]; total_count?: number }>(`/issues.json?${params}`)
        .then((res) => {
          const issues = (res.issues ?? []).filter((item) => !skip.has(item.id))
          setPickIssues(issues)
          setPickTotal(res.total_count ?? issues.length)
        })
        .catch((err) => setPickError(err instanceof Error ? err.message : '搜索失败'))
        .finally(() => setPickLoading(false))
    }, 250)
    return () => window.clearTimeout(handle)
  }, [childTool, issue, pickPage, pickQuery])

  useEffect(() => {
    if (childTool !== 'template' || !issue?.project?.id) return
    const projectId = issue.project.id
    setTemplatesLoading(true)
    setTemplateError(null)
    void api<{ templates: IssueTemplateRow[] }>(`/studio/issue_templates?project_id=${projectId}`)
      .then((res) => setTemplates(res.templates ?? []))
      .catch((err) => setTemplateError(err instanceof Error ? err.message : '模板加载失败'))
      .finally(() => setTemplatesLoading(false))
  }, [childTool, issue?.project?.id])

  const open = issueId !== null

  function showCustom(field: CustomField) {
    const raw = Array.isArray(field.value) ? field.value.filter(Boolean) : field.value
    if (Array.isArray(raw)) {
      const text = fieldFormats[field.id] === 'user' ? raw.map((id) => userNames[id] || id).join('、') : raw.join('、')
      return text || '—'
    }
    if (raw == null || raw === '') return '—'
    if (fieldFormats[field.id] === 'user') return userNames[String(raw)] || String(raw)
    if (fieldFormats[field.id] === 'bool') return raw === '1' ? '是' : raw === '0' ? '否' : String(raw)
    return String(raw)
  }

  function showChange(detail: JournalDetail, value?: string | null) {
    if (value == null || value === '') return '空'
    if (detail.property === 'attr' && detail.name === 'status_id') return statusNames[value] || value
    if (detail.property === 'attr' && detail.name === 'priority_id') return priorities.find((item) => String(item.id) === value)?.name || value
    if (detail.property === 'attr' && detail.name === 'fixed_version_id') return versions.find((item) => String(item.id) === value)?.name || value
    if (detail.property === 'attr' && detail.name === 'done_ratio') return `${value}%`
    if (detail.property === 'attr' && (detail.name === 'assigned_to_id' || detail.name === 'author_id')) return userNames[value] || value
    if (detail.property === 'attr' && (detail.name === 'parent_id' || detail.name === 'child_id')) return `#${value}`
    if (detail.property === 'cf' && fieldFormats[Number(detail.name)] === 'user') return userNames[value] || value
    if (detail.property === 'cf' && fieldFormats[Number(detail.name)] === 'bool') return value === '1' ? '是' : value === '0' ? '否' : value
    return value
  }

  function changeLabel(detail: JournalDetail) {
    if (detail.property === 'attachment') return '附件'
    if (detail.property === 'cf') {
      return issue?.custom_fields?.find((field) => String(field.id) === detail.name)?.name || `字段 ${detail.name}`
    }
    return ATTR_LABEL[detail.name] || detail.name
  }

  function applyMarkdown(before: string, after = '', placeholder = '') {
  const el = descriptionRef.current
  const current = editRef.current
  if (!el || !current) return
  const start = el.selectionStart ?? current.description.length
  const end = el.selectionEnd ?? start
  const selected = current.description.slice(start, end) || placeholder
  const description = current.description.slice(0, start) + before + selected + after + current.description.slice(end)
  const next = { ...current, description }
  editRef.current = next
  setEdit(next)
  const selectFrom = start + before.length
  const selectTo = selectFrom + selected.length
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(selectFrom, selectTo)
  })
}

function prefixLines(prefix: string) {
  const el = descriptionRef.current
  const current = editRef.current
  if (!el || !current) return
  const start = el.selectionStart ?? current.description.length
  const end = el.selectionEnd ?? start
  const block = current.description.slice(start, end) || '列表项'
  const replaced = block
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : prefix + line))
    .join('\n')
  const description = current.description.slice(0, start) + replaced + current.description.slice(end)
  const next = { ...current, description }
  editRef.current = next
  setEdit(next)
  requestAnimationFrame(() => el.focus())
}

function startResize(event: ReactPointerEvent<HTMLDivElement>) {
  event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    function move(ev: PointerEvent) {
      const next = Math.min(640, Math.max(240, startWidth - (ev.clientX - startX)))
      setSidebarWidth(next)
    }
    function stop() {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      setSidebarWidth((width) => {
        localStorage.setItem('studio_issue_sidebar_width', String(width))
        return width
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  async function pasteImages(files: File[], text: string, start: number, end: number) {
    const uploads = []
    for (const file of files) uploads.push(await uploadImageFile(file))
    const markup = uploads.map((item) => imageMarkup(item.filename)).join('\n')
    return { uploads, text: insertAt(text, start, end, markup) }
  }

  async function pasteIntoDescription(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = clipboardImageFiles(event.clipboardData)
    const current = editRef.current
    if (!images.length || !current || !issueId) return
    event.preventDefault()
    const start = event.currentTarget.selectionStart ?? current.description.length
    const end = event.currentTarget.selectionEnd ?? start
    pasting.current = true
    flash('正在上传图片…')
    try {
      const result = await pasteImages(images, current.description, start, end)
      await saveFields({ ...current, description: result.text }, result.uploads)
    } catch (err) {
      flash(err instanceof Error ? err.message : '图片上传失败')
    } finally {
      pasting.current = false
    }
  }

  async function saveFields(next: EditState, uploads?: Array<{ token: string; filename: string; content_type: string }>) {
    if (!issueId) return
    const key = editKey(next)
    editRef.current = next
    setEdit(next)
    if (key === savedKey.current && !uploads?.length) return
    setError(null)
    try {
      await api(`/issues/${issueId}.json`, {
        method: 'PUT',
        body: {
          issue: {
            subject: next.subject,
            description: next.description,
            tracker_id: next.tracker_id,
            status_id: next.status_id,
            assigned_to_id: next.assigned_to_id,
            priority_id: next.priority_id,
            fixed_version_id: next.fixed_version_id,
            parent_issue_id: next.parent_issue_id,
            estimated_hours: next.estimated_hours,
            start_date: next.start_date,
            due_date: next.due_date,
            done_ratio: Number(next.done_ratio),
            custom_fields: customFieldDefs.map((field) => ({
              id: field.id,
              value: next.custom_values[field.id] ?? (field.multiple ? [] : ''),
            })),
            ...(uploads?.length ? { uploads } : {}),
          },
        },
      })
      savedKey.current = key
      flash('已保存')
      setEditingDescription(false)
      await load(issueId)
      onUpdated?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败'
      setError(message)
      flash(message)
    }
  }

  async function addWatcher(userId: string) {
    if (!issueId || !userId) return
    try {
      await api(`/issues/${issueId}/watchers.json`, { method: 'POST', body: { user_id: Number(userId) } })
      flash('已保存')
      await load(issueId)
    } catch (err) {
      flash(err instanceof Error ? err.message : '添加关注者失败')
    }
  }

  async function removeWatcher(userId: number) {
    if (!issueId) return
    try {
      await api(`/issues/${issueId}/watchers/${userId}.json`, { method: 'DELETE' })
      flash('已保存')
      await load(issueId)
    } catch (err) {
      flash(err instanceof Error ? err.message : '移除关注者失败')
    }
  }

  const previewImages = (issue?.attachments ?? [])
    .filter((file) => file.content_type?.startsWith('image/'))
    .map((file) => ({ id: file.id, src: withKey(file.content_url), name: file.filename }))

  function openPreviewByName(filename: string) {
    const index = previewImages.findIndex((item) => item.name === filename)
    if (index >= 0) setPreviewIndex(index)
  }

  function openPreviewById(id: number) {
    const index = previewImages.findIndex((item) => item.id === id)
    if (index >= 0) setPreviewIndex(index)
  }

  const content = (
              <>
              {!issue ? (
                <div className="flex flex-1 items-center justify-center">
                  {error ? <p className="text-sm text-red-600">{error}</p> : <Spinner />}
                </div>
              ) : (
                <>
                  {toast ? (
                    <div className="pointer-events-none fixed left-1/2 top-16 z-[80] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
                      {toast}
                    </div>
                  ) : null}
                  <header className="flex items-start gap-3 border-b border-gray-200 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                        <StatusBadge name={issue.status.name} closed={issue.status.is_closed} />
                        <span>{issue.tracker?.name}</span>
                        <span>·</span>
                        <span>{issue.project?.name}</span>
                      </div>
                      {layout === 'drawer' ? (
                        <Link
                          to={`/issues/${issue.id}`}
                          className={[
                            'mt-1 block text-lg font-semibold leading-snug hover:text-blue-600 hover:underline',
                            issue.status.is_closed ? 'text-gray-400 line-through' : 'text-gray-900',
                          ].join(' ')}
                        >
                          #{issue.id} {issue.subject}
                        </Link>
                      ) : issue.attributes_editable && edit ? (
                        <input
                          className="mt-1 w-full bg-transparent text-lg font-semibold leading-snug text-gray-900 outline-none ring-blue-500 focus:ring-2"
                          value={edit.subject}
                          onChange={(e) => setEdit({ ...edit, subject: e.target.value })}
                          onBlur={() => {
                            if (editRef.current) void saveFields(editRef.current)
                          }}
                        />
                      ) : (
                        <h2
                          className={[
                            'mt-1 text-lg font-semibold leading-snug',
                            issue.status.is_closed ? 'text-gray-400 line-through' : 'text-gray-900',
                          ].join(' ')}
                        >
                          #{issue.id} {issue.subject}
                        </h2>
                      )}
                    </div>
                    {issue.deletable ? (
                      <button
                        type="button"
                        className="shrink-0 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                        disabled={deleting}
                        onClick={() => {
                          if (!issueId) return
                          const notes = ['删除后不能恢复。']
                          if ((issue.children?.length ?? 0) > 0) notes.push('下面的子单会一起删除。')
                          if ((issue.total_spent_hours ?? 0) > 0) notes.push(`已登记的 ${issue.total_spent_hours} 小时会一起删除。`)
                          void confirm({
                            title: `删除 #${issue.id}`,
                            description: `确定删除「${issue.subject}」？${notes.join('')}`,
                          }).then((ok) => {
                            if (!ok) return
                            setDeleting(true)
                            void api(`/issues/${issueId}.json`, { method: 'DELETE' })
                              .then(() => {
                                onUpdated?.()
                                onClose()
                              })
                              .catch((err) => {
                                flash(err instanceof Error ? err.message : '删除失败')
                                setDeleting(false)
                              })
                          })
                        }}
                      >
                        {deleting ? '删除中…' : '删除'}
                      </button>
                    ) : null}
                    {layout === 'drawer' ? (
                      <button type="button" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" onClick={onClose}>
                        <X className="h-5 w-5" />
                      </button>
                    ) : (
                      <button type="button" className="shrink-0 text-sm text-gray-500 hover:text-gray-800" onClick={onClose}>
                        返回
                      </button>
                    )}
                  </header>
                  <div
                    className="flex min-h-0 flex-1 flex-col md:flex-row"
                    style={{ ['--issue-sidebar' as string]: `${sidebarWidth}px` }}
                  >
                    <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
                      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200">
                        {(
                          [
                            ['description', '描述'],
                            ['attachments', `附件(${issue.attachments?.length ?? 0})`],
                            ['children', `子单(${issue.children?.length ?? 0})`],
                            ['relations', `关联单(${issue.relations?.length ?? 0})`],
                            ['activity', '活动'],
                            ['watchers', `跟踪者(${issue.watchers?.length ?? 0})`],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={[
                              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm',
                              detailTab === id ? 'border-blue-600 font-medium text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900',
                            ].join(' ')}
                            onClick={() => setDetailTab(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {detailTab === 'description' ? (
                        <>
                        {issue.attributes_editable && edit ? (
                          editingDescription ? (
                            <div className="overflow-hidden rounded-lg border border-gray-200">
                              <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1">
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
                                  {(
                                    [
                                      ['粗体', Bold, () => applyMarkdown('**', '**', '粗体')],
                                      ['斜体', Italic, () => applyMarkdown('*', '*', '斜体')],
                                      ['删除线', Strikethrough, () => applyMarkdown('~~', '~~', '删除线')],
                                      ['标题', Heading2, () => prefixLines('## ')],
                                      ['引用', Quote, () => prefixLines('> ')],
                                      ['无序列表', List, () => prefixLines('- ')],
                                      ['有序列表', ListOrdered, () => prefixLines('1. ')],
                                      ['行内代码', Code, () => applyMarkdown('`', '`', '代码')],
                                      ['链接', Link2, () => applyMarkdown('[', '](https://)', '链接文字')],
                                      ['图片', Image, () => applyMarkdown('![](', ')', '图片地址')],
                                    ] as const
                                  ).map(([label, Icon, action]) => (
                                    <button
                                      key={label}
                                      type="button"
                                      title={label}
                                      className="rounded p-1.5 text-gray-600 hover:bg-white hover:text-gray-900"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={action}
                                    >
                                      <Icon className="h-4 w-4" />
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  title="保存"
                                  className="rounded p-1.5 text-blue-600 hover:bg-white"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    setEditingDescription(false)
                                    if (editRef.current) void saveFields(editRef.current)
                                  }}
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  title="取消"
                                  className="rounded p-1.5 text-gray-500 hover:bg-white"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    const current = editRef.current
                                    if (current) {
                                      const next = { ...current, description: descriptionBaseline.current }
                                      editRef.current = next
                                      setEdit(next)
                                    }
                                    setEditingDescription(false)
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              <Textarea
                                ref={descriptionRef}
                                autoFocus
                                rows={8}
                                value={edit.description}
                                placeholder="填写描述，可直接粘贴图片"
                                className="rounded-none border-0 focus:ring-0"
                                onChange={(e) => {
                                  const next = { ...edit, description: e.target.value }
                                  editRef.current = next
                                  setEdit(next)
                                }}
                                onBlur={() => {
                                  setEditingDescription(false)
                                  if (pasting.current) return
                                  if (editRef.current) void saveFields(editRef.current)
                                }}
                                onPaste={(event) => {
                                  void pasteIntoDescription(event)
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              className="min-h-24 cursor-text rounded-lg px-1 py-1 hover:bg-gray-50"
                              title="双击编辑"
                              onDoubleClick={() => {
                                descriptionBaseline.current = edit.description
                                setEditingDescription(true)
                              }}
                            >
                              {edit.description ? (
                                <RichText text={edit.description} attachments={issue.attachments ?? []} onOpenImage={openPreviewByName} />
                              ) : (
                                <p className="text-sm text-gray-400">双击编辑描述，可粘贴图片</p>
                              )}
                            </div>
                          )
                        ) : issue.description ? (
                          looksLikeHtml(issue.description) ? (
                            <div
                              className="prose prose-sm max-w-none text-sm leading-6 text-gray-800"
                              dangerouslySetInnerHTML={{ __html: sanitizeHtml(issue.description) }}
                            />
                          ) : (
                            <div className="whitespace-pre-wrap text-sm leading-6 text-gray-800">
                              <RichText text={issue.description} attachments={issue.attachments ?? []} onOpenImage={openPreviewByName} />
                            </div>
                          )
                        ) : (
                          <p className="text-sm text-gray-400">（无描述）</p>
                        )}
                        </>
                      ) : null}

                      {detailTab === 'attachments' ? (
                        (issue.attachments ?? []).length === 0 ? (
                          <p className="text-sm text-gray-400">还没有附件</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {(issue.attachments ?? []).map((file) => {
                              const href = withKey(file.content_url)
                              const image = file.content_type?.startsWith('image/')
                              if (image) {
                                return (
                                  <button key={file.id} type="button" className="block text-left" onClick={() => openPreviewById(file.id)}>
                                    <img src={href} alt={file.filename} className="h-28 w-full cursor-zoom-in rounded-lg border border-gray-200 object-cover" />
                                    <div className="mt-1 truncate text-xs text-gray-600">{file.filename}</div>
                                  </button>
                                )
                              }
                              return (
                                <a key={file.id} href={href} target="_blank" rel="noreferrer" className="block">
                                  <div className="flex h-28 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">
                                    文件
                                  </div>
                                  <div className="mt-1 truncate text-xs text-gray-600">{file.filename}</div>
                                </a>
                              )
                            })}
                          </div>
                        )
                      ) : null}

                      {detailTab === 'children' ? (
                        <div>
                          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                              onClick={() =>
                                openCreate({
                                  projectId: String(issue.project.id),
                                  parentIssueId: String(issue.id),
                                })
                              }
                            >
                              <Plus className="h-4 w-4" />
                              新建子单
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                              onClick={() => {
                                setTemplateError(null)
                                setTemplateForm({
                                  name: '',
                                  subject: '',
                                  description: '',
                                  tracker_id: String(trackers[0]?.id ?? ''),
                                  priority_id: String(priorities.find((item) => item.name === '普通')?.id ?? priorities[0]?.id ?? ''),
                                })
                                setChildTool('template')
                              }}
                            >
                              <Files className="h-4 w-4" />
                              模板建子单
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                              onClick={() => {
                                setPickQuery('')
                                setPickPage(0)
                                setPickTotal(0)
                                setPickSelected([])
                                setPickError(null)
                                setChildTool('pick')
                              }}
                            >
                              <ListPlus className="h-4 w-4" />
                              选择已有任务单
                            </button>
                          </div>
                          {(issue.children ?? []).length === 0 ? (
                            <p className="text-sm text-gray-400">还没有子单</p>
                          ) : (
                            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                              {(issue.children ?? []).map((child) => (
                                <li key={child.id}>
                                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => onOpen?.(child.id)}>
                                    <span className="mr-2 text-gray-400">{child.tracker?.name}</span>
                                    <span className="text-gray-400">#{child.id}</span> {child.subject}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}

                      <Dialog open={childTool === 'pick'} onClose={() => { if (!pickSaving) setChildTool(null) }} className="relative z-[60]">
                        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                        <div className="fixed inset-0 flex items-center justify-center p-4">
                          <DialogPanel className="flex max-h-[80vh] w-[min(640px,100%)] flex-col rounded-xl bg-white p-5 shadow-xl">
                            <div className="flex items-start justify-between gap-3">
                              <DialogTitle className="text-lg font-semibold text-gray-900">选择已有任务单</DialogTitle>
                              <div className="flex shrink-0 items-center gap-2 pt-1 text-sm text-gray-500">
                                <span>共 {pickTotal} 条</span>
                                <button
                                  type="button"
                                  className="rounded px-1.5 py-0.5 text-gray-700 hover:bg-gray-100 disabled:text-gray-300"
                                  disabled={pickPage <= 0 || pickLoading}
                                  onClick={() => setPickPage((page) => Math.max(0, page - 1))}
                                >
                                  上一页
                                </button>
                                <span>
                                  {pickPage + 1}/{Math.max(1, Math.ceil(pickTotal / PICK_PAGE_SIZE))}
                                </span>
                                <button
                                  type="button"
                                  className="rounded px-1.5 py-0.5 text-gray-700 hover:bg-gray-100 disabled:text-gray-300"
                                  disabled={pickLoading || (pickPage + 1) * PICK_PAGE_SIZE >= pickTotal}
                                  onClick={() => setPickPage((page) => page + 1)}
                                >
                                  下一页
                                </button>
                              </div>
                            </div>
                            <p className="mt-1 text-sm text-gray-500">选中的工单会改挂到 #{issue.id} 下面。已经是本单子单、本单或本单父单的不会出现。</p>
                            <Input
                              className="mt-3"
                              placeholder="搜索主题，或输入工单号"
                              value={pickQuery}
                              onChange={(e) => {
                                setPickQuery(e.target.value)
                                setPickPage(0)
                              }}
                            />
                            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200">
                              {pickLoading ? (
                                <div className="flex justify-center py-8"><Spinner /></div>
                              ) : pickIssues.length === 0 ? (
                                <p className="px-3 py-6 text-sm text-gray-400">没有可添加的工单</p>
                              ) : (
                                <ul className="divide-y divide-gray-100">
                                  {pickIssues.map((item) => {
                                    const checked = pickSelected.includes(item.id)
                                    return (
                                      <li key={item.id}>
                                        <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                                          <input
                                            type="checkbox"
                                            className="mt-1"
                                            checked={checked}
                                            onChange={() =>
                                              setPickSelected((current) =>
                                                checked ? current.filter((id) => id !== item.id) : [...current, item.id],
                                              )
                                            }
                                          />
                                          <span>
                                            <span className="text-gray-400">{item.tracker?.name} #{item.id}</span> {item.subject}
                                            <span className="ml-2 text-xs text-gray-400">{item.status?.name}</span>
                                            {item.parent?.id ? <span className="ml-2 text-xs text-amber-600">当前父单 #{item.parent.id}</span> : null}
                                          </span>
                                        </label>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            </div>
                            {pickError ? <p className="mt-2 text-sm text-red-600">{pickError}</p> : null}
                            <div className="mt-4 flex gap-2">
                              <Button
                                disabled={pickSaving || pickSelected.length === 0}
                                onClick={() => {
                                  if (!issueId) return
                                  setPickSaving(true)
                                  setPickError(null)
                                  void (async () => {
                                    const errors: string[] = []
                                    for (const id of pickSelected) {
                                      try {
                                        await api(`/issues/${id}.json`, { method: 'PUT', body: { issue: { parent_issue_id: issueId } } })
                                      } catch (err) {
                                        errors.push(`#${id} ${err instanceof Error ? err.message : '添加失败'}`)
                                      }
                                    }
                                    await load(issueId)
                                    onUpdated?.()
                                    setPickSaving(false)
                                    if (errors.length) setPickError(errors.join('；'))
                                    else {
                                      flash('已添加为子单')
                                      setChildTool(null)
                                    }
                                  })()
                                }}
                              >
                                {pickSaving ? '添加中…' : `添加为子单${pickSelected.length ? `（${pickSelected.length}）` : ''}`}
                              </Button>
                              <Button variant="secondary" disabled={pickSaving} onClick={() => setChildTool(null)}>取消</Button>
                            </div>
                          </DialogPanel>
                        </div>
                      </Dialog>

                      <Dialog open={childTool === 'template'} onClose={() => { if (!templateSaving) setChildTool(null) }} className="relative z-[60]">
                        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                        <div className="fixed inset-0 flex items-center justify-center p-4">
                          <DialogPanel className="max-h-[86vh] w-[min(720px,100%)] overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
                            <DialogTitle className="text-lg font-semibold text-gray-900">模板建子单</DialogTitle>
                            <p className="mt-1 text-sm text-gray-500">选一个模板，会打开新建子单，并带上模板里的主题、描述、跟踪标签和优先级。</p>
                            <div className="mt-3 rounded-lg border border-gray-200">
                              {templatesLoading ? (
                                <div className="flex justify-center py-6"><Spinner /></div>
                              ) : templates.length === 0 ? (
                                <p className="px-3 py-4 text-sm text-gray-400">这个项目还没有子单模板</p>
                              ) : (
                                <ul className="divide-y divide-gray-100">
                                  {templates.map((template) => (
                                    <li key={template.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                      <div className="min-w-0 flex-1">
                                        <div className="font-medium text-gray-900">{template.name}</div>
                                        <div className="truncate text-gray-500">
                                          {template.tracker_name} · {template.subject}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        className="text-blue-600 hover:text-blue-800"
                                        onClick={() => {
                                          setChildTool(null)
                                          openCreate({
                                            projectId: String(issue.project.id),
                                            parentIssueId: String(issue.id),
                                            preset: {
                                              subject: template.subject,
                                              description: template.description,
                                              tracker_id: String(template.tracker_id),
                                              priority_id: template.priority_id ? String(template.priority_id) : '',
                                            },
                                          })
                                        }}
                                      >
                                        使用
                                      </button>
                                      <button
                                        type="button"
                                        className="text-red-600 hover:text-red-800"
                                        onClick={() => {
                                          void api(`/studio/issue_templates/${template.id}`, { method: 'DELETE' })
                                            .then(() => setTemplates((current) => current.filter((item) => item.id !== template.id)))
                                            .catch((err) => setTemplateError(err instanceof Error ? err.message : '删除失败'))
                                        }}
                                      >
                                        删除
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <form
                              className="mt-4 space-y-3 border-t border-gray-100 pt-4"
                              onSubmit={(e) => {
                                e.preventDefault()
                                if (!issue.project?.id) return
                                setTemplateSaving(true)
                                setTemplateError(null)
                                void api<{ template: IssueTemplateRow }>('/studio/issue_templates', {
                                  method: 'POST',
                                  body: {
                                    project_id: issue.project.id,
                                    name: templateForm.name,
                                    subject: templateForm.subject,
                                    description: templateForm.description,
                                    tracker_id: templateForm.tracker_id,
                                    priority_id: templateForm.priority_id || undefined,
                                  },
                                })
                                  .then((res) => {
                                    setTemplates((current) => [...current, res.template].sort((a, b) => a.name.localeCompare(b.name, 'zh')))
                                    setTemplateForm({
                                      name: '',
                                      subject: '',
                                      description: '',
                                      tracker_id: templateForm.tracker_id,
                                      priority_id: templateForm.priority_id,
                                    })
                                  })
                                  .catch((err) => setTemplateError(err instanceof Error ? err.message : '保存失败'))
                                  .finally(() => setTemplateSaving(false))
                              }}
                            >
                              <div className="text-sm font-medium text-gray-900">新建模板</div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Input required placeholder="模板名称" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
                                <Input required placeholder="子单主题" value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} />
                                <Select value={templateForm.tracker_id} onChange={(e) => setTemplateForm({ ...templateForm, tracker_id: e.target.value })}>
                                  {trackers.map((tracker) => (
                                    <option key={tracker.id} value={tracker.id}>{tracker.name}</option>
                                  ))}
                                </Select>
                                <Select value={templateForm.priority_id} onChange={(e) => setTemplateForm({ ...templateForm, priority_id: e.target.value })}>
                                  {priorities.map((priority) => (
                                    <option key={priority.id} value={priority.id}>{priority.name}</option>
                                  ))}
                                </Select>
                              </div>
                              <Textarea rows={3} placeholder="描述，可留空" value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} />
                              {templateError ? <p className="text-sm text-red-600">{templateError}</p> : null}
                              <div className="flex gap-2">
                                <Button type="submit" disabled={templateSaving}>{templateSaving ? '保存中…' : '保存模板'}</Button>
                                <Button variant="secondary" onClick={() => setChildTool(null)}>关闭</Button>
                              </div>
                            </form>
                          </DialogPanel>
                        </div>
                      </Dialog>

                      {detailTab === 'relations' ? (
                        (issue.relations ?? []).length === 0 ? (
                          <p className="text-sm text-gray-400">还没有关联单</p>
                        ) : (
                          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                            {(issue.relations ?? []).map((relation) => {
                              const otherId = otherIssueId(relation, issue.id)
                              return (
                                <li key={relation.id}>
                                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => onOpen?.(otherId)}>
                                    <span className="mr-2 text-gray-500">{RELATION_LABEL[relation.relation_type] || relation.relation_type}</span>
                                    <span className="text-blue-600">#{otherId}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )
                      ) : null}

                      {detailTab === 'activity' ? (
                        <>
                          {issue.notes_addable === false ? (
                            <p className="mb-4 text-sm text-gray-500">当前角色不能添加备注。</p>
                          ) : (
                            <Textarea
                              className="mb-4"
                              rows={3}
                              value={note}
                              placeholder="添加备注"
                              onChange={(e) => setNote(e.target.value)}
                              onBlur={() => {
                                const text = note.trim()
                                if (!text || !issueId || savingNote) return
                                setSavingNote(true)
                                void api(`/issues/${issueId}.json`, { method: 'PUT', body: { issue: { notes: text } } })
                                  .then(async () => {
                                    setNote('')
                                    flash('已保存')
                                    await load(issueId)
                                    onUpdated?.()
                                  })
                                  .catch((err) => {
                                    flash(err instanceof Error ? err.message : '保存失败')
                                  })
                                  .finally(() => setSavingNote(false))
                              }}
                            />
                          )}
                          {(issue.journals ?? []).length === 0 ? <p className="text-sm text-gray-400">还没有更新记录</p> : null}
                          <ol className="space-y-3">
                            {[...(issue.journals ?? [])]
                              .sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime() || b.id - a.id)
                              .map((journal) => (
                              <li key={journal.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                                <div className="mb-1 text-xs text-gray-500">
                                  {journal.user?.name} · {new Date(journal.created_on).toLocaleString()}
                                </div>
                                {(journal.details ?? []).length > 0 ? (
                                  <ul className="mb-1 space-y-0.5 text-gray-700">
                                    {(journal.details ?? []).map((detail, index) => (
                                      <li key={`${journal.id}-${index}`}>
                                        {changeLabel(detail)}：{showChange(detail, detail.old_value)} → {showChange(detail, detail.new_value)}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                {journal.notes ? <RichText text={journal.notes} attachments={issue.attachments ?? []} onOpenImage={openPreviewByName} /> : null}
                              </li>
                            ))}
                          </ol>
                        </>
                      ) : null}

                      {detailTab === 'watchers' ? (
                        <div className="text-sm">
                          <div className="mb-2 flex flex-wrap gap-1">
                            {(issue.watchers ?? []).length === 0 ? <span className="text-sm text-gray-400">还没有跟踪者</span> : null}
                            {(issue.watchers ?? []).map((user) => (
                              <span key={user.id} className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-800 ring-1 ring-gray-200">
                                {user.name}
                                <button type="button" aria-label={`移除 ${user.name}`} className="text-gray-400 hover:text-gray-700" onClick={() => void removeWatcher(user.id)}>
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <Select
                            className="!w-56"
                            value=""
                            onChange={(e) => {
                              const userId = e.target.value
                              if (userId) void addWatcher(userId)
                            }}
                          >
                            <option value="">添加跟踪者</option>
                            {assignees
                              .filter((user) => !(issue.watchers ?? []).some((watcher) => watcher.id === user.id))
                              .map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.name}
                                </option>
                              ))}
                          </Select>
                        </div>
                      ) : null}
                    </div>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="调整左右宽度"
                      className="hidden w-1.5 shrink-0 cursor-col-resize bg-gray-100 hover:bg-blue-300 md:block"
                      onPointerDown={startResize}
                    />
                    <aside
                      className="w-full shrink-0 overflow-y-auto border-t border-gray-200 bg-gray-50/70 p-4 md:w-[var(--issue-sidebar)] md:border-l md:border-t-0"
                    >
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">基本信息</div>
                      {issue.attributes_editable && edit ? (
                        <div className="space-y-3">
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">跟踪标签</span>
                            <Select
                              value={edit.tracker_id}
                              onChange={(e) => {
                                void saveFields({ ...edit, tracker_id: e.target.value })
                              }}
                            >
                              {trackers.map((tracker) => (
                                <option key={tracker.id} value={tracker.id}>
                                  {tracker.name}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">状态</span>
                            <Select value={edit.status_id} onChange={(e) => void saveFields({ ...edit, status_id: e.target.value })}>
                              {(issue.allowed_statuses ?? [issue.status]).map((status) => (
                                <option key={status.id} value={status.id}>
                                  {status.name}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">指派给</span>
                            <Select value={edit.assigned_to_id} onChange={(e) => void saveFields({ ...edit, assigned_to_id: e.target.value })}>
                              <option value="">未指派</option>
                              {assignees.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.name}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">优先级</span>
                            <Select value={edit.priority_id} onChange={(e) => void saveFields({ ...edit, priority_id: e.target.value })}>
                              {priorities.map((priority) => (
                                <option key={priority.id} value={priority.id}>
                                  {priority.name}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">目标版本</span>
                            <Select value={edit.fixed_version_id} onChange={(e) => void saveFields({ ...edit, fixed_version_id: e.target.value })}>
                              <option value="">无</option>
                              {versions.map((version) => (
                                <option key={version.id} value={version.id}>
                                  {version.name}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">完成百分比</span>
                            <Select value={edit.done_ratio} onChange={(e) => void saveFields({ ...edit, done_ratio: e.target.value })}>
                              {Array.from({ length: 11 }, (_, index) => index * 10).map((value) => (
                                <option key={value} value={value}>
                                  {value}%
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">开始日期</span>
                            <input
                              type="date"
                              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                              value={edit.start_date}
                              onChange={(e) => void saveFields({ ...edit, start_date: e.target.value })}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">完成日期</span>
                            <input
                              type="date"
                              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                              value={edit.due_date}
                              onChange={(e) => void saveFields({ ...edit, due_date: e.target.value })}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">父单</span>
                            <Input
                              inputMode="numeric"
                              placeholder="父工单编号"
                              value={edit.parent_issue_id}
                              onChange={(e) => setEdit({ ...edit, parent_issue_id: e.target.value.replace(/\D/g, '') })}
                              onBlur={() => {
                                if (editRef.current) void saveFields(editRef.current)
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-gray-500">预估工作量</span>
                            <Input
                              inputMode="decimal"
                              placeholder="小时"
                              value={edit.estimated_hours}
                              onChange={(e) => setEdit({ ...edit, estimated_hours: e.target.value })}
                              onBlur={() => {
                                if (editRef.current) void saveFields(editRef.current)
                              }}
                            />
                          </label>
                          {customFieldDefs.map((field) => (
                            <CustomFieldControl
                              key={field.id}
                              field={field}
                              value={edit.custom_values[field.id] ?? defaultFieldValue(field)}
                              onChange={(value) => {
                                const next = { ...edit, custom_values: { ...edit.custom_values, [field.id]: value } }
                                if (['string', 'text', 'int', 'float', 'link'].includes(field.field_format)) {
                                  editRef.current = next
                                  setEdit(next)
                                } else {
                                  void saveFields(next)
                                }
                              }}
                              onBlur={() => {
                                if (['string', 'text', 'int', 'float', 'link'].includes(field.field_format) && editRef.current) {
                                  void saveFields(editRef.current)
                                }
                              }}
                            />
                          ))}
                          <p className="text-xs text-gray-500">可改的状态由你所在用户组的角色和工作流决定。</p>
                          {error ? <p className="text-sm text-red-600">{error}</p> : null}
                        </div>
                      ) : (
                        <>
                          <div className="mb-2">
                            <StatusBadge name={issue.status.name} closed={issue.status.is_closed} />
                          </div>
                          <p className="mb-2 text-xs text-gray-500">当前角色只能查看，不能修改这些字段。</p>
                          <Field label="指派给" value={dash(issue.assigned_to?.name)} />
                          <Field label="目标版本" value={dash(issue.fixed_version?.name)} />
                          <Field label="开始日期" value={dash(issue.start_date)} />
                          <Field label="完成日期" value={dash(issue.due_date)} />
                          <Field label="优先级" value={dash(issue.priority?.name)} />
                          <Field label="完成百分比" value={`${issue.done_ratio ?? 0}%`} />
                        </>
                      )}
                      {issue.attributes_editable ? null : (
                        <>
                          <Field label="跟踪标签" value={dash(issue.tracker?.name)} />
                          <Field label="父单" value={issue.parent?.id ? `#${issue.parent.id}` : '—'} />
                          <Field label="预估工作量" value={dash(issue.estimated_hours)} />
                          {(issue.custom_fields ?? []).map((field) => (
                            <Field key={field.id} label={field.name} value={showCustom(field)} />
                          ))}
                        </>
                      )}
                      <Field label="类别" value={dash(issue.category?.name)} />
                      <Field label="总工时" value={dash(issue.total_spent_hours ?? issue.spent_hours)} />
                      <Field label="作者" value={dash(issue.author?.name)} />
                      <div className="mt-3 space-y-1 text-xs text-gray-400">
                        <div>创建于 {issue.created_on ? new Date(issue.created_on).toLocaleString() : '—'}</div>
                        <div>更新于 {issue.updated_on ? new Date(issue.updated_on).toLocaleString() : '—'}</div>
                      </div>
                    </aside>
                  </div>
                </>
              )}
              </>
  )

  const lightbox =
    previewIndex != null
      ? createPortal(
          <ImageLightbox images={previewImages} index={previewIndex} onClose={() => setPreviewIndex(null)} onChange={setPreviewIndex} />,
          document.body,
        )
      : null

  if (layout === 'page') {
    return (
      <div className="flex h-[calc(100vh-7.5rem)] min-h-[640px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
        {content}
        {lightbox}
        {confirmDialog}
      </div>
    )
  }

  return (
    <>
    {confirmDialog}
    <Transition show={open} as={Fragment}>
      <Dialog
        className="relative z-40"
        onClose={() => {
          if (previewIndex != null) return
          onClose()
        }}
      >
        <TransitionChild
          as={Fragment}
          enter="transition-opacity duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/20" />
        </TransitionChild>
        <div className="fixed inset-y-0 right-0 flex max-w-full">
          <TransitionChild
            as={Fragment}
            enter="transform transition duration-200 ease-out"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="transform transition duration-150 ease-in"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <DialogPanel className="flex h-full w-[min(1100px,100vw)] flex-col bg-white shadow-2xl">
              {content}
              {lightbox}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
    </>
  )
}
