import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, getApiKey, type Issue, type Project } from '../../lib/api'
import { Button, Input, Select, Spinner, Textarea } from '../../components/ui'

type Named = { id: number; name: string; is_default?: boolean }

type FormState = {
  project_id: string
  tracker_id: string
  subject: string
  description: string
  status_id: string
  assigned_to_id: string
  fixed_version_id: string
  parent_issue_id: string
  priority_id: string
  start_date: string
  due_date: string
}

const emptyForm: FormState = {
  project_id: '',
  tracker_id: '',
  subject: '',
  description: '',
  status_id: '',
  assigned_to_id: '',
  fixed_version_id: '',
  parent_issue_id: '',
  priority_id: '',
  start_date: '',
  due_date: '',
}

type IssueFieldOption = { label: string; value: string }
export type IssueCustomField = {
  id: number
  name: string
  description?: string
  field_format: string
  multiple: boolean
  required: boolean
  value: string | string[] | null
  options: IssueFieldOption[]
}

export function defaultFieldValue(field: IssueCustomField): string | string[] {
  if (field.multiple) {
    const list = Array.isArray(field.value) ? field.value : field.value ? [String(field.value)] : []
    return list.map(String).filter(Boolean)
  }
  if (field.value == null || field.value === '') return field.field_format === 'bool' ? '0' : ''
  return String(field.value)
}

function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  )
}

export function CustomFieldControl({
  field,
  value,
  onChange,
  onBlur,
}: {
  field: IssueCustomField
  value: string | string[]
  onChange: (value: string | string[]) => void
  onBlur?: () => void
}) {
  const hint = field.description ? <p className="mt-1 text-xs text-gray-400">{field.description}</p> : null
  if (field.field_format === 'bool') {
    const checked = value === '1'
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked ? '1' : '0')} />
        <span>
          {field.name}
          {field.required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </span>
      </label>
    )
  }
  if (field.field_format === 'text') {
    return (
      <Field label={field.name} required={field.required}>
        <Textarea rows={4} value={typeof value === 'string' ? value : value.join('\n')} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
        {hint}
      </Field>
    )
  }
  const selectable = field.options.length > 0 || ['list', 'user', 'version', 'enumeration'].includes(field.field_format)
  if (selectable) {
    if (field.multiple) {
      const selected = Array.isArray(value) ? value : []
      return (
        <Field label={field.name} required={field.required}>
          <Select
            multiple
            value={selected}
            onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((option) => option.value))}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {hint}
        </Field>
      )
    }
    return (
      <Field label={field.name} required={field.required}>
        <Select value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.required ? '请选择' : ''}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {hint}
      </Field>
    )
  }
  return (
    <Field label={field.name} required={field.required}>
      <Input
        type={field.field_format === 'date' ? 'date' : field.field_format === 'int' || field.field_format === 'float' ? 'number' : 'text'}
        value={typeof value === 'string' ? value : value.join(',')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {hint}
    </Field>
  )
}

type IssueFormRequest = { mode: 'create'; projectId?: string } | { mode: 'edit'; id: string }

const IssueFormContext = createContext<{
  openCreate: (projectId?: string) => void
  openEdit: (id: string) => void
  savedTick: number
} | null>(null)

export function useIssueForm() {
  const ctx = useContext(IssueFormContext)
  if (!ctx) throw new Error('useIssueForm must be used within IssueFormProvider')
  return ctx
}

export function IssueFormProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<IssueFormRequest | null>(null)
  const [savedTick, setSavedTick] = useState(0)
  const openCreate = useCallback((projectId?: string) => setRequest({ mode: 'create', projectId }), [])
  const openEdit = useCallback((id: string) => setRequest({ mode: 'edit', id }), [])
  return (
    <IssueFormContext.Provider
      value={{
        openCreate,
        openEdit,
        savedTick,
      }}
    >
      {children}
      <IssueFormDialog
        open={request !== null}
        issueId={request?.mode === 'edit' ? request.id : undefined}
        projectId={request?.mode === 'create' ? request.projectId : undefined}
        onClose={() => setRequest(null)}
        onSaved={() => {
          setSavedTick((value) => value + 1)
          setRequest(null)
        }}
      />
    </IssueFormContext.Provider>
  )
}

export function IssueFormPage() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { openCreate, openEdit } = useIssueForm()
  useEffect(() => {
    if (id) openEdit(id)
    else openCreate(search.get('project_id') ?? undefined)
    navigate('/issues', { replace: true })
  }, [id, navigate, openCreate, openEdit, search])
  return null
}

function IssueFormDialog({
  open,
  issueId,
  projectId,
  onClose,
  onSaved,
}: {
  open: boolean
  issueId?: string
  projectId?: string
  onClose: () => void
  onSaved: (issueId: string) => void
}) {
  const editing = Boolean(issueId)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [projects, setProjects] = useState<Project[]>([])
  const [trackers, setTrackers] = useState<Named[]>([])
  const [statuses, setStatuses] = useState<Named[]>([])
  const [priorities, setPriorities] = useState<Named[]>([])
  const [assignees, setAssignees] = useState<Named[]>([])
  const [versions, setVersions] = useState<Named[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [customFields, setCustomFields] = useState<IssueCustomField[]>([])
  const [customValues, setCustomValues] = useState<Record<number, string | string[]>>({})
  const customValuesRef = useRef(customValues)
  customValuesRef.current = customValues
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch(partial: Partial<FormState>) {
    setForm((current) => ({ ...current, ...partial }))
  }

  useEffect(() => {
    if (!open) return
    customValuesRef.current = {}
    setCustomFields([])
    setCustomValues({})
  }, [open, issueId])

  useEffect(() => {
    if (!open || !form.project_id || !form.tracker_id) return
    const previous = customValuesRef.current
    let cancelled = false
    const params = new URLSearchParams({
      project_id: form.project_id,
      tracker_id: form.tracker_id,
    })
    if (form.status_id) params.set('status_id', form.status_id)
    if (issueId) params.set('issue_id', issueId)
    void api<{ fields: IssueCustomField[] }>(`/studio/issue_fields?${params}`).then((res) => {
      if (cancelled) return
      const fields = res.fields ?? []
      setCustomFields(fields)
      setCustomValues(() => {
        const next: Record<number, string | string[]> = {}
        for (const field of fields) {
          next[field.id] = previous[field.id] !== undefined ? previous[field.id] : defaultFieldValue(field)
        }
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [form.project_id, form.status_id, form.tracker_id, issueId, open])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setFiles([])
    void (async () => {
      const [projectsRes, trackersRes, statusesRes, prioritiesRes] = await Promise.all([
        api<{ projects: Project[] }>('/projects.json?limit=100'),
        api<{ trackers: Named[] }>('/trackers.json'),
        api<{ issue_statuses: Named[] }>('/issue_statuses.json'),
        api<{ issue_priorities: Named[] }>('/enumerations/IssuePriority.json'),
      ])
      const projectList = projectsRes.projects ?? []
      const trackerList = trackersRes.trackers ?? []
      const statusList = statusesRes.issue_statuses ?? []
      const priorityList = prioritiesRes.issue_priorities ?? []
      setProjects(projectList)
      setTrackers(trackerList)
      setStatuses(statusList)
      setPriorities(priorityList)

      if (editing && issueId) {
        const { issue } = await api<{
          issue: Issue & { parent?: { id: number } }
        }>(`/issues/${issueId}.json`)
        setForm({
          project_id: String(issue.project.id),
          tracker_id: String(issue.tracker.id),
          subject: issue.subject,
          description: issue.description ?? '',
          status_id: String(issue.status.id),
          assigned_to_id: issue.assigned_to ? String(issue.assigned_to.id) : '',
          fixed_version_id: issue.fixed_version ? String(issue.fixed_version.id) : '',
          parent_issue_id: issue.parent ? String(issue.parent.id) : '',
          priority_id: issue.priority ? String(issue.priority.id) : '',
          start_date: issue.start_date ?? '',
          due_date: issue.due_date ?? '',
        })
      } else {
        const presetProject = projectId
        const selectedProject = presetProject && projectList.some((p) => String(p.id) === presetProject)
          ? presetProject
          : String(projectList[0]?.id ?? '')
        setForm({
          ...emptyForm,
          project_id: selectedProject,
          tracker_id: String(trackerList[0]?.id ?? ''),
          status_id: String(statusList.find((s) => s.name === '新建')?.id ?? statusList[0]?.id ?? ''),
          priority_id: String(priorityList.find((p) => p.is_default)?.id ?? priorityList[0]?.id ?? ''),
        })
      }
      setLoading(false)
    })()
  }, [editing, issueId, open, projectId])

  useEffect(() => {
    if (!form.project_id) return
    const project = projects.find((item) => String(item.id) === form.project_id)
    const key = project?.identifier ?? form.project_id
    void Promise.all([
      api<{ memberships: Array<{ user?: Named }> }>(`/projects/${key}/memberships.json`),
      api<{ versions: Named[] }>(`/projects/${key}/versions.json`),
    ]).then(([members, versionRes]) => {
      const people = (members.memberships ?? []).flatMap((item) => (item.user ? [item.user] : []))
      setAssignees(people)
      setVersions(versionRes.versions ?? [])
    })
  }, [form.project_id, projects])

  async function uploadFiles() {
    const key = getApiKey()
    const uploads = []
    for (const file of files) {
      const res = await fetch('/uploads.json?filename=' + encodeURIComponent(file.name), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...(key ? { 'X-Redmine-API-Key': key } : {}),
        },
        body: file,
      })
      if (!res.ok) throw new Error(`附件上传失败：${file.name}`)
      const data = (await res.json()) as { upload: { token: string } }
      uploads.push({ token: data.upload.token, filename: file.name, content_type: file.type || 'application/octet-stream' })
    }
    return uploads
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const uploads = files.length ? await uploadFiles() : []
      const issue: Record<string, unknown> = {
        project_id: form.project_id,
        tracker_id: form.tracker_id,
        subject: form.subject,
        description: form.description,
        status_id: form.status_id || undefined,
        assigned_to_id: form.assigned_to_id || '',
        fixed_version_id: form.fixed_version_id || '',
        parent_issue_id: form.parent_issue_id || '',
        priority_id: form.priority_id || undefined,
        start_date: form.start_date || '',
        due_date: form.due_date || '',
      }
      if (uploads.length) issue.uploads = uploads
      if (customFields.length) {
        issue.custom_fields = customFields.map((field) => ({
          id: field.id,
          value: customValues[field.id] ?? (field.multiple ? [] : ''),
        }))
      }
      if (editing && issueId) {
        await api(`/issues/${issueId}.json`, { method: 'PUT', body: { issue } })
        onSaved(issueId)
      } else {
        const res = await api<{ issue: Issue }>('/issues.json', { method: 'POST', body: { issue } })
        onSaved(String(res.issue.id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="max-h-[92vh] w-[min(1100px,100%)] overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
          <DialogTitle className="mb-4 text-lg font-semibold text-gray-900">{editing ? '编辑工单' : '新建工单'}</DialogTitle>
          {loading ? (
            <Spinner />
          ) : (
      <form onSubmit={onSubmit}>
          <div className="mb-4 max-w-sm">
            <Field label="项目" required>
              <Select
                value={form.project_id}
                disabled={editing}
                required
                onChange={(e) => patch({ project_id: e.target.value, assigned_to_id: '', fixed_version_id: '' })}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <Field label="主题" required>
                <Input value={form.subject} required onChange={(e) => patch({ subject: e.target.value })} placeholder="请输入主题" />
              </Field>
              <Field label="描述">
                <Textarea rows={12} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
              </Field>
              <Field label="附件">
                <Input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                {files.length ? <p className="mt-1 text-xs text-gray-500">{files.map((file) => file.name).join('、')}</p> : null}
              </Field>
            </div>
            <div className="space-y-3">
              <Field label="跟踪标签" required>
                <Select value={form.tracker_id} required onChange={(e) => patch({ tracker_id: e.target.value })}>
                  {trackers.map((tracker) => (
                    <option key={tracker.id} value={tracker.id}>
                      {tracker.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="状态">
                <Select value={form.status_id} onChange={(e) => patch({ status_id: e.target.value })}>
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="指派给">
                <Select value={form.assigned_to_id} onChange={(e) => patch({ assigned_to_id: e.target.value })}>
                  <option value="">请选择</option>
                  {assignees.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="目标版本">
                <Select value={form.fixed_version_id} onChange={(e) => patch({ fixed_version_id: e.target.value })}>
                  <option value="">请选择</option>
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="父单">
                <Input
                  inputMode="numeric"
                  placeholder="父工单编号"
                  value={form.parent_issue_id}
                  onChange={(e) => patch({ parent_issue_id: e.target.value.replace(/\D/g, '') })}
                />
              </Field>
              <Field label="优先级">
                <Select value={form.priority_id} onChange={(e) => patch({ priority_id: e.target.value })}>
                  {priorities.map((priority) => (
                    <option key={priority.id} value={priority.id}>
                      {priority.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="开发开始时间">
                <Input type="date" value={form.start_date} onChange={(e) => patch({ start_date: e.target.value })} />
              </Field>
              <Field label="开发完成时间">
                <Input type="date" value={form.due_date} onChange={(e) => patch({ due_date: e.target.value })} />
              </Field>
              {customFields.map((field) => (
                <CustomFieldControl
                  key={field.id}
                  field={field}
                  value={customValues[field.id] ?? defaultFieldValue(field)}
                  onChange={(value) => setCustomValues((current) => ({ ...current, [field.id]: value }))}
                />
              ))}
            </div>
          </div>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? '保存中…' : editing ? '保存' : '创建'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              取消
            </Button>
          </div>
      </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
