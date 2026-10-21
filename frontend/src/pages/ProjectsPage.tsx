import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Project } from '../lib/api'
import { FormDialog } from '../components/FormDialog'
import { Button, Card, EmptyState, Input, PageHeader, Spinner, Textarea } from '../components/ui'

function suggestIdentifier(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [identifierEdited, setIdentifierEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  async function load() {
    const res = await api<{ projects: Project[] }>('/projects.json?limit=100')
    setProjects(res.projects ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setName('')
    setIdentifier('')
    setIdentifierEdited(false)
    setDescription('')
    setIsPublic(true)
    setError(null)
    setOpen(true)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await api<{ project: Project }>('/projects.json', {
        method: 'POST',
        body: {
          project: {
            name,
            identifier,
            description,
            is_public: isPublic,
          },
        },
      })
      setOpen(false)
      await load()
      navigate(`/projects/${res.project.identifier}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="项目" actions={<Button onClick={openCreate}>新建项目</Button>} />
      {projects.length === 0 ? (
        <EmptyState title="暂无可见项目" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.identifier}`}>
              <Card className="h-full p-4 transition hover:border-blue-200 hover:shadow-md">
                <div className="font-semibold text-gray-900">{p.name}</div>
                <div className="mt-1 text-xs text-gray-500">{p.identifier}</div>
                {p.description ? (
                  <p className="mt-3 line-clamp-3 text-sm text-gray-600">{p.description.replace(/<[^>]+>/g, '')}</p>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
      <FormDialog open={open} title="新建项目" saving={saving} error={error} onClose={() => setOpen(false)} onSubmit={onSubmit}>
        <Input
          value={name}
          placeholder="项目名称"
          required
          onChange={(e) => {
            const next = e.target.value
            setName(next)
            if (!identifierEdited) setIdentifier(suggestIdentifier(next))
          }}
        />
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">标识</span>
          <Input
            value={identifier}
            placeholder="小写字母、数字、下划线或短横线，如 demo"
            required
            onChange={(e) => {
              setIdentifierEdited(true)
              setIdentifier(e.target.value.trim().toLowerCase())
            }}
          />
          <span className="mt-1 block text-xs text-gray-400">中文名称需要单独填写标识，创建后不能修改。</span>
        </label>
        <Textarea rows={3} value={description} placeholder="描述（可选）" onChange={(e) => setDescription(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          公开项目
        </label>
      </FormDialog>
    </div>
  )
}
