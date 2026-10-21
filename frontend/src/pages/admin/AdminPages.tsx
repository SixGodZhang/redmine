import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { GripVertical } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { useConfirm } from '../../components/ConfirmDialog'
import { FormDialog } from '../../components/FormDialog'
import { Button, Card, EmptyState, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui'

const permissionLabels: Record<string, string> = {
  add_project: '新建项目',
  edit_project: '编辑项目',
  close_project: '关闭项目',
  manage_members: '管理成员',
  manage_versions: '管理目标版本',
  view_issues: '查看工单',
  add_issues: '新建工单',
  edit_issues: '编辑工单',
  edit_own_issues: '编辑自己的工单',
  delete_issues: '删除工单',
  manage_subtasks: '管理子单',
  add_issue_notes: '添加备注',
  manage_issue_relations: '管理关联',
  view_gantt: '查看甘特图',
  view_calendar: '查看日历',
  view_time_entries: '查看时间',
  log_time: '登记时间',
  view_news: '查看新闻',
  manage_news: '管理新闻',
  view_documents: '查看文档',
  view_wiki_pages: '查看 Wiki',
  edit_wiki_pages: '编辑 Wiki',
  view_files: '查看文件',
  manage_files: '管理文件',
  view_messages: '查看讨论',
  add_messages: '发帖',
  manage_boards: '管理讨论板',
}

type GroupUser = { id: number; name: string }
type GroupMembership = {
  id: number
  project: { id: number; name: string }
  roles: Array<{ id: number; name: string }>
}
type GroupDetail = { id: number; name: string; users?: GroupUser[]; memberships?: GroupMembership[] }

export function AdminGroupsPage() {
  const [groups, setGroups] = useState<Array<{ id: number; name: string; users?: GroupUser[] }>>([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [users, setUsers] = useState<Array<{ id: number; login: string; firstname: string; lastname: string }>>([])
  const [projects, setProjects] = useState<Array<{ id: number; name: string }>>([])
  const [roles, setRoles] = useState<Array<{ id: number; name: string }>>([])
  const [userId, setUserId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [rolePermissions, setRolePermissions] = useState<string[]>([])
  const [dialogError, setDialogError] = useState<string | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  async function load() {
    const res = await api<{ groups: typeof groups }>('/groups.json?include=users')
    setGroups(res.groups ?? [])
    setLoading(false)
  }

  async function openGroup(id: number) {
    setActiveId(id)
    setDialogError(null)
    setUserId('')
    setProjectId('')
    setRoleId('')
    setRolePermissions([])
    const [groupRes, userRes, projectRes, roleRes] = await Promise.all([
      api<{ group: GroupDetail }>(`/groups/${id}.json?include=users,memberships`),
      api<{ users: typeof users }>('/users.json?limit=100'),
      api<{ projects: typeof projects }>('/projects.json?limit=100'),
      api<{ roles: typeof roles }>('/roles.json'),
    ])
    setDetail(groupRes.group)
    setUsers(userRes.users ?? [])
    setProjects(projectRes.projects ?? [])
    setRoles(roleRes.roles ?? [])
  }

  async function refreshDetail() {
    if (!activeId) return
    const groupRes = await api<{ group: GroupDetail }>(`/groups/${activeId}.json?include=users,memberships`)
    setDetail(groupRes.group)
    await load()
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!roleId) {
      setRolePermissions([])
      return
    }
    void api<{ role: { permissions: string[] } }>(`/roles/${roleId}.json`).then((res) => {
      setRolePermissions(res.role.permissions ?? [])
    })
  }, [roleId])

  if (loading) return <Spinner />

  const memberIds = new Set((detail?.users ?? []).map((user) => user.id))

  return (
    <div>
      <PageHeader
        title="用户组"
        actions={
          <Button
            onClick={() => {
              setName('')
              setError(null)
              setCreating(true)
            }}
          >
            添加用户组
          </Button>
        }
      />
      <p className="mb-4 text-sm text-gray-500">先把用户加入用户组，再把用户组加入项目并指定角色。角色上的权限就是这个组在该项目里的权限。</p>
      <FormDialog
        open={creating}
        title="添加用户组"
        saving={savingCreate}
        error={error}
        onClose={() => setCreating(false)}
        onSubmit={async (e) => {
          e.preventDefault()
          setSavingCreate(true)
          setError(null)
          try {
            await api('/groups.json', { method: 'POST', body: { group: { name } } })
            setCreating(false)
            await load()
          } catch (err) {
            setError(err instanceof Error ? err.message : '添加失败')
          } finally {
            setSavingCreate(false)
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="用户组名称" required />
      </FormDialog>
      {groups.length === 0 ? (
        <EmptyState title="暂无用户组" />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-gray-500">{(g.users ?? []).map((u) => u.name).join('、') || '无成员'}</div>
              </div>
              <Button variant="secondary" onClick={() => void openGroup(g.id)}>
                管理
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={activeId !== null} onClose={() => setActiveId(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{detail?.name ?? '用户组'}</DialogTitle>
            {!detail ? (
              <Spinner />
            ) : (
              <div className="mt-4 space-y-6">
                <section>
                  <h3 className="mb-2 font-medium">成员</h3>
                  <div className="flex flex-wrap gap-2">
                    <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="max-w-xs">
                      <option value="">选择用户</option>
                      {users
                        .filter((user) => !memberIds.has(user.id))
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.firstname} {user.lastname}（{user.login}）
                          </option>
                        ))}
                    </Select>
                    <Button
                      disabled={!userId}
                      onClick={async () => {
                        setDialogError(null)
                        try {
                          await api(`/groups/${detail.id}/users.json`, { method: 'POST', body: { user_id: Number(userId) } })
                          setUserId('')
                          await refreshDetail()
                        } catch (err) {
                          setDialogError(err instanceof Error ? err.message : '加入失败')
                        }
                      }}
                    >
                      加入
                    </Button>
                  </div>
                  <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {(detail.users ?? []).length === 0 ? <li className="px-3 py-2 text-sm text-gray-500">还没有成员</li> : null}
                    {(detail.users ?? []).map((user) => (
                      <li key={user.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>{user.name}</span>
                        <Button
                          variant="danger"
                          onClick={async () => {
                            const ok = await confirm({
                              title: '移出成员',
                              description: `确定把「${user.name}」移出用户组「${detail.name}」？`,
                            })
                            if (!ok) return
                            setDialogError(null)
                            try {
                              await api(`/groups/${detail.id}/users/${user.id}.json`, { method: 'DELETE' })
                              await refreshDetail()
                            } catch (err) {
                              setDialogError(err instanceof Error ? err.message : '移出失败')
                            }
                          }}
                        >
                          移出
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-1 font-medium">项目权限</h3>
                  <p className="mb-2 text-xs text-gray-500">选择项目和角色。该角色包含的权限会授予组内全部用户。</p>
                  <div className="flex flex-wrap gap-2">
                    <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="max-w-[180px]">
                      <option value="">选择项目</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </Select>
                    <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="max-w-[180px]">
                      <option value="">选择角色</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      disabled={!projectId || !roleId}
                      onClick={async () => {
                        setDialogError(null)
                        try {
                          const existing = (detail.memberships ?? []).find((item) => item.project.id === Number(projectId))
                          if (existing) {
                            const roleIds = Array.from(new Set([...existing.roles.map((role) => role.id), Number(roleId)]))
                            await api(`/memberships/${existing.id}.json`, {
                              method: 'PUT',
                              body: { membership: { role_ids: roleIds } },
                            })
                          } else {
                            await api(`/projects/${projectId}/memberships.json`, {
                              method: 'POST',
                              body: { membership: { user_id: detail.id, role_ids: [Number(roleId)] } },
                            })
                          }
                          await refreshDetail()
                        } catch (err) {
                          setDialogError(err instanceof Error ? err.message : '授权失败')
                        }
                      }}
                    >
                      赋予
                    </Button>
                  </div>
                  {rolePermissions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rolePermissions.map((permission) => (
                        <span key={permission} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {permissionLabels[permission] ?? permission}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {(detail.memberships ?? []).length === 0 ? (
                      <li className="px-3 py-2 text-sm text-gray-500">还没有项目权限</li>
                    ) : null}
                    {(detail.memberships ?? []).map((membership) => (
                      <li key={membership.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span>
                          {membership.project.name}
                          <span className="ml-2 text-gray-500">{membership.roles.map((role) => role.name).join('、')}</span>
                        </span>
                        <Button
                          variant="danger"
                          onClick={async () => {
                            const ok = await confirm({
                              title: '移除项目权限',
                              description: `确定移除「${detail.name}」在「${membership.project.name}」的权限？`,
                            })
                            if (!ok) return
                            setDialogError(null)
                            try {
                              await api(`/memberships/${membership.id}.json`, { method: 'DELETE' })
                              await refreshDetail()
                            } catch (err) {
                              setDialogError(err instanceof Error ? err.message : '移除失败')
                            }
                          }}
                        >
                          移除
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
                {dialogError ? <p className="text-sm text-red-600">{dialogError}</p> : null}
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => setActiveId(null)}>
                    关闭
                  </Button>
                </div>
              </div>
            )}
          </DialogPanel>
        </div>
      </Dialog>
      {confirmDialog}
    </div>
  )
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<Array<{ id: number; login: string; firstname: string; lastname: string; mail: string; status: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ login: '', firstname: '', lastname: '', mail: '', password: '' })

  async function load() {
    try {
      const res = await api<{ users: typeof users }>('/users.json?limit=100')
      setUsers(res.users ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '用户列表加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="用户"
        actions={
          <Button
            onClick={() => {
              setForm({ login: '', firstname: '', lastname: '', mail: '', password: '' })
              setError(null)
              setOpen(true)
            }}
          >
            添加用户
          </Button>
        }
      />
      <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">添加用户</DialogTitle>
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e: FormEvent) => {
                e.preventDefault()
                setSaving(true)
                setError(null)
                try {
                  await api('/users.json', {
                    method: 'POST',
                    body: {
                      user: {
                        login: form.login,
                        firstname: form.firstname,
                        lastname: form.lastname,
                        mail: form.mail,
                        password: form.password,
                        password_confirmation: form.password,
                      },
                    },
                  })
                  setOpen(false)
                  await load()
                } catch (err) {
                  setError(err instanceof Error ? err.message : '添加失败')
                } finally {
                  setSaving(false)
                }
              }}
            >
              <Input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="登录名" required />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={form.firstname} onChange={(e) => setForm({ ...form, firstname: e.target.value })} placeholder="名" required />
                <Input value={form.lastname} onChange={(e) => setForm({ ...form, lastname: e.target.value })} placeholder="姓" required />
              </div>
              <Input type="email" value={form.mail} onChange={(e) => setForm({ ...form, mail: e.target.value })} placeholder="邮箱" required />
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="密码" required />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? '创建中…' : '创建'}
                </Button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2">登录名</th>
              <th className="px-4 py-2">姓名</th>
              <th className="px-4 py-2">邮箱</th>
              <th className="px-4 py-2">状态</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{u.login}</td>
                <td className="px-4 py-2">
                  {u.firstname} {u.lastname}
                </td>
                <td className="px-4 py-2">{u.mail}</td>
                <td className="px-4 py-2">{u.status === 1 ? '活跃' : u.status === 3 ? '锁定' : u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type PermissionModule = {
  module: string
  label: string
  permissions: Array<{ name: string; label: string }>
}

export function AdminRolesPage() {
  const [roles, setRoles] = useState<Array<{ id: number; name: string }>>([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<{ id: number; name: string } | null>(null)
  const [modules, setModules] = useState<PermissionModule[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()

  async function load() {
    const res = await api<{ roles: typeof roles }>('/roles.json')
    setRoles(res.roles ?? [])
    setLoading(false)
  }

  async function openRole(role: { id: number; name: string }) {
    setActive(role)
    setError(null)
    const [catalog, detail] = await Promise.all([
      api<{ modules: PermissionModule[] }>('/studio/role_permissions'),
      api<{ role: { permissions: string[] } }>(`/roles/${role.id}.json`),
    ])
    setModules(catalog.modules ?? [])
    setSelected(detail.role.permissions ?? [])
  }

  function toggle(permission: string) {
    setSelected((current) =>
      current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission],
    )
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="角色"
        actions={
          <Button
            onClick={() => {
              setName('')
              setError(null)
              setCreating(true)
            }}
          >
            添加角色
          </Button>
        }
      />
      <p className="mb-4 text-sm text-gray-500">点「权限」勾选这个角色可以做的事。用户组加入项目时选择该角色，组内用户就获得这些权限。</p>
      {error && !creating && !active ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <FormDialog
        open={creating}
        title="添加角色"
        saving={savingCreate}
        error={creating ? error : null}
        onClose={() => setCreating(false)}
        onSubmit={async (e) => {
          e.preventDefault()
          setSavingCreate(true)
          setError(null)
          try {
            await api('/studio/roles', { method: 'POST', body: { role: { name } } })
            setCreating(false)
            await load()
          } catch (err) {
            setError(err instanceof Error ? err.message : '添加失败')
          } finally {
            setSavingCreate(false)
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="角色名称" required />
      </FormDialog>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {roles.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>{r.name}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void openRole(r)}>
                权限
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const ok = await confirm({
                    title: '删除角色',
                    description: `确定删除角色「${r.name}」？删除后无法恢复。若仍有成员使用该角色，删除会被拒绝。`,
                  })
                  if (!ok) return
                  setError(null)
                  try {
                    await api(`/studio/roles/${r.id}`, { method: 'DELETE' })
                    await load()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '删除失败')
                  }
                }}
              >
                删除
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={active !== null} onClose={() => setActive(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{active?.name} 的权限</DialogTitle>
            {modules.length === 0 ? (
              <Spinner />
            ) : (
              <div className="mt-4 space-y-5">
                {modules.map((group) => (
                  <section key={group.module}>
                    <h3 className="mb-2 text-sm font-medium text-gray-900">{group.label}</h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {group.permissions.map((permission) => (
                        <label key={permission.name} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300"
                            checked={selected.includes(permission.name)}
                            onChange={() => toggle(permission.name)}
                          />
                          {permission.label}
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
                {error && active ? <p className="text-sm text-red-600">{error}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setActive(null)}>
                    取消
                  </Button>
                  <Button
                    disabled={saving || !active}
                    onClick={async () => {
                      if (!active) return
                      setSaving(true)
                      setError(null)
                      try {
                        await api(`/studio/roles/${active.id}`, {
                          method: 'PATCH',
                          body: { role: { permissions: selected } },
                        })
                        setActive(null)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '保存失败')
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    {saving ? '保存中…' : '保存'}
                  </Button>
                </div>
              </div>
            )}
        </DialogPanel>
      </div>
    </Dialog>
      {confirmDialog}
    </div>
  )
}

export function AdminTrackersPage() {
  const [trackers, setTrackers] = useState<Array<{ id: number; name: string }>>([])
  const [statuses, setStatuses] = useState<Array<{ id: number; name: string }>>([])
  const [name, setName] = useState('')
  const [defaultStatusId, setDefaultStatusId] = useState('')
  const [creating, setCreating] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { confirm, dialog: confirmDialog } = useConfirm()

  async function load() {
    const [trackerRes, statusRes] = await Promise.all([
      api<{ trackers: Array<{ id: number; name: string }> }>('/trackers.json'),
      api<{ issue_statuses: Array<{ id: number; name: string }> }>('/issue_statuses.json'),
    ])
    const statusList = statusRes.issue_statuses ?? []
    setTrackers(trackerRes.trackers ?? [])
    setStatuses(statusList)
    setDefaultStatusId((current) => current || String(statusList[0]?.id ?? ''))
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="跟踪标签"
        actions={
          <Button
            onClick={() => {
              setName('')
              setDefaultStatusId(String(statuses[0]?.id ?? ''))
              setCreateError(null)
              setCreating(true)
            }}
          >
            添加跟踪标签
          </Button>
        }
      />
      <FormDialog
        open={creating}
        title="添加跟踪标签"
        saving={savingCreate}
        error={createError}
        onClose={() => setCreating(false)}
        onSubmit={async (e) => {
          e.preventDefault()
          setSavingCreate(true)
          setCreateError(null)
          try {
            await api('/studio/trackers', {
              method: 'POST',
              body: { tracker: { name, default_status_id: defaultStatusId } },
            })
            setCreating(false)
            await load()
          } catch (err) {
            setCreateError(err instanceof Error ? err.message : '添加失败')
          } finally {
            setSavingCreate(false)
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="跟踪标签名称" required />
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">默认状态</span>
          <Select value={defaultStatusId} onChange={(e) => setDefaultStatusId(e.target.value)} required>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </Select>
        </label>
      </FormDialog>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {trackers.map((t) => (
          <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{t.name}</span>
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await confirm({
                  title: '删除跟踪标签',
                  description: `确定删除跟踪标签「${t.name}」？若已有工单使用，删除会被拒绝。`,
                })
                if (!ok) return
                await api(`/studio/trackers/${t.id}`, { method: 'DELETE' })
                await load()
              }}
            >
              删除
            </Button>
          </li>
        ))}
      </ul>
      {confirmDialog}
    </div>
  )
}

export function AdminStatusesPage() {
  const [statuses, setStatuses] = useState<Array<{ id: number; name: string; is_closed: boolean }>>([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const dragIndex = useRef<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  async function load() {
    const res = await api<{ issue_statuses: typeof statuses }>('/issue_statuses.json')
    setStatuses(res.issue_statuses ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function persistOrder(reordered: typeof statuses) {
    setStatuses(reordered)
    setDeleteError(null)
    try {
      await api('/studio/issue_statuses/reorder', { method: 'PATCH', body: { ids: reordered.map((status) => status.id) } })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '调整顺序失败')
      await load()
    }
  }

  function dropOn(index: number) {
    const from = dragIndex.current
    dragIndex.current = null
    setOverIndex(null)
    if (from === null || from === index) return
    const reordered = [...statuses]
    const [item] = reordered.splice(from, 1)
    reordered.splice(index, 0, item)
    void persistOrder(reordered)
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="工单状态"
        actions={
          <Button
            onClick={() => {
              setName('')
              setCreateError(null)
              setCreating(true)
            }}
          >
            添加工单状态
          </Button>
        }
      />
      <FormDialog
        open={creating}
        title="添加工单状态"
        saving={savingCreate}
        error={createError}
        onClose={() => setCreating(false)}
        onSubmit={async (e) => {
          e.preventDefault()
          setSavingCreate(true)
          setCreateError(null)
          try {
            await api('/studio/issue_statuses', { method: 'POST', body: { issue_status: { name } } })
            setCreating(false)
            await load()
          } catch (err) {
            setCreateError(err instanceof Error ? err.message : '添加失败')
          } finally {
            setSavingCreate(false)
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="状态名称" required />
      </FormDialog>
      <p className="mb-3 text-sm text-gray-500">拖动整行调整顺序。越靠前，新建和修改工单时的状态下拉越靠前。</p>
      {deleteError ? <p className="mb-3 text-sm text-red-600">{deleteError}</p> : null}
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {statuses.map((s, index) => (
          <li
            key={s.id}
            draggable
            aria-label={`拖动调整「${s.name}」的顺序`}
            className={[
              'flex cursor-grab items-center justify-between gap-3 px-4 py-3 text-sm active:cursor-grabbing',
              overIndex === index ? 'bg-blue-50' : '',
            ].join(' ')}
            onDragStart={(event) => {
              dragIndex.current = index
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => {
              dragIndex.current = null
              setOverIndex(null)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setOverIndex(index)
            }}
            onDrop={() => dropOn(index)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="text-xs text-gray-400">{index + 1}</span>
              <span>
                {s.name} {s.is_closed ? <span className="text-gray-400">（关闭）</span> : null}
              </span>
            </span>
            <div className="flex gap-2">
              <Button
              variant="danger"
              draggable={false}
              onMouseDown={(event) => event.stopPropagation()}
              onDragStart={(event) => event.preventDefault()}
              onClick={async () => {
                const ok = await confirm({
                  title: '删除工单状态',
                  description: `确定删除工单状态「${s.name}」？若已有工单使用，删除会被拒绝。`,
                })
                if (!ok) return
                setDeleteError(null)
                try {
                  await api(`/studio/issue_statuses/${s.id}`, { method: 'DELETE' })
                  await load()
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : '删除失败')
                }
              }}
              >
              删除
            </Button>
            </div>
          </li>
        ))}
      </ul>
      {confirmDialog}
    </div>
  )
}

type WorkflowStatus = { id: number; name: string; is_closed?: boolean }
type WorkflowDetail = {
  statuses: WorkflowStatus[]
  transitions: {
    always?: Record<string, Array<{ to: number }>>
    author?: Record<string, Array<{ to: number }>>
    assignee?: Record<string, Array<{ to: number }>>
  }
}

function checkedPairs(groups: Array<Record<string, Array<{ to: number }>> | undefined>) {
  const pairs = new Set<string>()
  for (const group of groups) {
    if (!group) continue
    for (const [from, items] of Object.entries(group)) {
      for (const item of items) pairs.add(`${from}-${item.to}`)
    }
  }
  return pairs
}

export function AdminWorkflowsPage() {
  const [roles, setRoles] = useState<Array<{ id: number; name: string }>>([])
  const [trackers, setTrackers] = useState<Array<{ id: number; name: string }>>([])
  const [roleId, setRoleId] = useState('')
  const [trackerId, setTrackerId] = useState('')
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api<{ roles: typeof roles; trackers: typeof trackers }>('/studio/workflows').then((res) => {
      setRoles(res.roles ?? [])
      setTrackers(res.trackers ?? [])
      setRoleId(String(res.roles?.[0]?.id ?? ''))
      setTrackerId(String(res.trackers?.[0]?.id ?? ''))
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!roleId || !trackerId) return
    setMessage(null)
    setError(null)
    void api<WorkflowDetail>(`/studio/workflows/edit?role_id=${roleId}&tracker_id=${trackerId}&used_statuses_only=0`).then((res) => {
      const list = res.statuses ?? []
      setStatuses(list)
      setChecked(checkedPairs([res.transitions?.always]))
      setExtra(checkedPairs([res.transitions?.author, res.transitions?.assignee]))
    })
  }, [roleId, trackerId])

  function toggle(from: number, to: number) {
    const key = `${from}-${to}`
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setMessage(null)
  }

  const rows = [{ id: 0, name: '新建工单时' }, ...statuses]

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="工作流"
        actions={
          <Button
            disabled={saving || !roleId || !trackerId}
            onClick={async () => {
              const transitions: Record<string, Record<string, { always: string }>> = {}
              for (const from of rows) {
                transitions[from.id] = {}
                for (const to of statuses) {
                  if (from.id !== 0 && from.id === to.id) continue
                  transitions[from.id][to.id] = { always: checked.has(`${from.id}-${to.id}`) ? '1' : '0' }
                }
              }
              setSaving(true)
              setError(null)
              setMessage(null)
              try {
                await api('/studio/workflows', {
                  method: 'PATCH',
                  body: { role_id: roleId, tracker_id: trackerId, transitions },
                })
                setMessage('已保存。这个角色的人以后只能改到勾选过的状态。')
              } catch (err) {
                setError(err instanceof Error ? err.message : '保存失败')
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? '保存中…' : '保存'}
          </Button>
        }
      />
      <p className="mb-4 text-sm text-gray-500">
        先选角色和跟踪标签。行是当前状态，列是可以改去的状态。勾选表示这个角色的人可以这样改。
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="!w-48">
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
        <Select value={trackerId} onChange={(e) => setTrackerId(e.target.value)} className="!w-48">
          {trackers.map((tracker) => (
            <option key={tracker.id} value={tracker.id}>
              {tracker.name}
            </option>
          ))}
        </Select>
      </div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-green-700">{message}</p> : null}
      {statuses.length === 0 ? (
        <EmptyState title="没有可配置的状态" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500">当前状态</th>
                {statuses.map((status) => (
                  <th key={status.id} className="px-2 py-2 text-center font-medium text-gray-500">
                    {status.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((from) => (
                <tr key={from.id} className="border-t border-gray-100">
                  <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-gray-800">{from.name}</th>
                  {statuses.map((to) => {
                    const same = from.id !== 0 && from.id === to.id
                    const key = `${from.id}-${to.id}`
                    return (
                      <td key={to.id} className="px-2 py-2 text-center">
                        {same ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            aria-label={`${from.name} 可以改为 ${to.name}`}
                            checked={checked.has(key)}
                            onChange={() => toggle(from.id, to.id)}
                          />
                        )}
                        {!same && extra.has(key) && !checked.has(key) ? (
                          <div className="text-[10px] text-gray-400">仅作者或指派人</div>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type CustomFieldRow = {
  id: number
  name: string
  description?: string
  type: string
  type_label: string
  field_format: string
  format_label: string
  is_required: boolean
  is_for_all: boolean
  possible_values: string[]
  trackers: Array<{ id: number; name: string }>
  projects: Array<{ id: number; name: string }>
  group_ids?: number[]
}

const emptyFieldForm = {
  type: 'IssueCustomField',
  name: '',
  field_format: 'string',
  is_required: false,
  is_for_all: true,
  tracker_ids: [] as number[],
  project_ids: [] as number[],
  group_ids: [] as number[],
  possible_values: '',
  description: '',
}

export function AdminCustomFieldsPage() {
  const [fields, setFields] = useState<CustomFieldRow[]>([])
  const [types, setTypes] = useState<Array<{ value: string; label: string }>>([])
  const [formats, setFormats] = useState<Array<{ value: string; label: string }>>([])
  const [formatsByType, setFormatsByType] = useState<Record<string, Array<{ value: string; label: string }>>>({})
  const [groups, setGroups] = useState<Array<{ id: number; name: string }>>([])
  const [trackers, setTrackers] = useState<Array<{ id: number; name: string }>>([])
  const [projects, setProjects] = useState<Array<{ id: number; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyFieldForm)
  const { confirm, dialog: confirmDialog } = useConfirm()

  async function load() {
    const res = await api<{
      fields: CustomFieldRow[]
      types: Array<{ value: string; label: string }>
      formats: Array<{ value: string; label: string }>
      trackers: Array<{ id: number; name: string }>
      projects: Array<{ id: number; name: string }>
      groups: Array<{ id: number; name: string }>
      formats_by_type: Record<string, Array<{ value: string; label: string }>>
    }>('/studio/custom_fields')
    setFields(res.fields ?? [])
    setTypes(res.types ?? [])
    setFormats(res.formats ?? [])
    setFormatsByType(res.formats_by_type ?? {})
    setGroups(res.groups ?? [])
    setTrackers(res.trackers ?? [])
    setProjects(res.projects ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditingId(null)
    setError(null)
    setForm({ ...emptyFieldForm, tracker_ids: trackers.map((tracker) => tracker.id) })
    setOpen(true)
  }

  function openEdit(field: CustomFieldRow) {
    setEditingId(field.id)
    setError(null)
    setForm({
      type: field.type,
      name: field.name,
      field_format: field.field_format,
      is_required: field.is_required,
      is_for_all: field.is_for_all,
      tracker_ids: field.trackers.map((tracker) => tracker.id),
      project_ids: field.projects.map((project) => project.id),
      group_ids: field.group_ids ?? [],
      possible_values: (field.possible_values ?? []).join('\n'),
      description: field.description ?? '',
    })
    setOpen(true)
  }

  if (loading) return <Spinner />

  const activeFormats = formatsByType[form.type] ?? formats

  return (
    <div>
      <PageHeader title="自定义字段" actions={<Button onClick={openCreate}>添加字段</Button>} />
      <p className="mb-4 text-sm text-gray-500">字段定义后，适用于所选跟踪标签的工单会多出这一栏。不勾选「用于全部项目」时，只出现在勾选的项目里。</p>
      {fields.length === 0 ? (
        <EmptyState title="还没有自定义字段" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2">名称</th>
                <th className="px-4 py-2">用于</th>
                <th className="px-4 py-2">格式</th>
                <th className="px-4 py-2">跟踪标签</th>
                <th className="px-4 py-2">项目</th>
                <th className="px-4 py-2">必填</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{field.name}</td>
                  <td className="px-4 py-2">{field.type_label}</td>
                  <td className="px-4 py-2 text-gray-600">{field.format_label}</td>
                  <td className="px-4 py-2 text-gray-600">{field.trackers.map((tracker) => tracker.name).join('、') || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {field.type === 'IssueCustomField' ? (field.is_for_all ? '全部项目' : field.projects.map((project) => project.name).join('、') || '—') : '—'}
                  </td>
                  <td className="px-4 py-2">{field.is_required ? '是' : '否'}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => openEdit(field)}>
                        修改
                      </Button>
                      <Button
                        variant="danger"
                        onClick={async () => {
                          const ok = await confirm({
                            title: '删除自定义字段',
                            description: `确定删除「${field.name}」？已填写在工单上的值会一起删除。`,
                          })
                          if (!ok) return
                          await api(`/studio/custom_fields/${field.id}`, { method: 'DELETE' })
                          await load()
                        }}
                      >
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <FormDialog
        open={open}
        title={editingId ? '修改自定义字段' : '添加自定义字段'}
        submitLabel={editingId ? '保存' : '创建'}
        saving={saving}
        error={error}
        onClose={() => setOpen(false)}
        onSubmit={async (event) => {
          event.preventDefault()
          setSaving(true)
          setError(null)
          if (form.type === 'IssueCustomField' && !form.is_for_all && form.project_ids.length === 0) {
            setError('请至少选择一个项目')
            setSaving(false)
            return
          }
          if (form.field_format === 'user' && form.group_ids.length === 0) {
            setError('请至少选择一个用户组')
            setSaving(false)
            return
          }
          const custom_field = {
            name: form.name,
            field_format: form.field_format,
            is_required: form.is_required,
            is_for_all: form.is_for_all,
            tracker_ids: form.tracker_ids,
            project_ids: form.is_for_all ? [] : form.project_ids,
            possible_values: form.field_format === 'list' ? form.possible_values : '',
            possible_principals: form.field_format === 'user' ? 'user' : undefined,
            group_ids: form.field_format === 'user' ? form.group_ids : [],
            description: form.description,
          }
          try {
            if (editingId) {
              await api(`/studio/custom_fields/${editingId}`, { method: 'PATCH', body: { custom_field } })
            } else {
              await api('/studio/custom_fields', { method: 'POST', body: { type: form.type, custom_field } })
            }
            setOpen(false)
            await load()
          } catch (err) {
            setError(err instanceof Error ? err.message : '保存失败')
          } finally {
            setSaving(false)
          }
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">用于</span>
          <Select value={form.type} disabled={Boolean(editingId)} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {types.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="字段名称" required />
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">格式</span>
          <Select
            value={form.field_format}
            disabled={Boolean(editingId)}
            onChange={(e) => setForm({ ...form, field_format: e.target.value })}
          >
            {activeFormats.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </Select>
        </label>
        {form.field_format === 'list' ? (
          <Textarea
            rows={4}
            value={form.possible_values}
            placeholder="每行一个可选值"
            onChange={(e) => setForm({ ...form, possible_values: e.target.value })}
          />
        ) : null}
        {form.field_format === 'user' ? (
          <div className="space-y-2 text-sm">
            <p className="text-gray-500">不用填写可选值。新建工单时，这里会列出所选用户组里的成员。</p>
            <div>
              <div className="mb-1 text-gray-600">用户组</div>
              {groups.length === 0 ? (
                <p className="text-xs text-gray-400">还没有用户组。请先在「用户组」里创建，并把成员加进去。</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {groups.map((group) => (
                    <label key={group.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={form.group_ids.includes(group.id)}
                        onChange={(e) => {
                          const group_ids = e.target.checked
                            ? [...form.group_ids, group.id]
                            : form.group_ids.filter((id) => id !== group.id)
                          setForm({ ...form, group_ids })
                        }}
                      />
                      {group.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        {form.type === 'IssueCustomField' ? (
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_for_all}
                onChange={(e) => setForm({ ...form, is_for_all: e.target.checked })}
              />
              用于全部项目
            </label>
            {form.is_for_all ? null : (
              <div>
                <div className="mb-1 text-gray-600">项目</div>
                <div className="flex flex-wrap gap-3">
                  {projects.map((project) => (
                    <label key={project.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={form.project_ids.includes(project.id)}
                        onChange={(e) => {
                          const project_ids = e.target.checked
                            ? [...form.project_ids, project.id]
                            : form.project_ids.filter((id) => id !== project.id)
                          setForm({ ...form, project_ids })
                        }}
                      />
                      {project.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
              />
              必填
            </label>
            <div>
              <div className="mb-1 text-gray-600">跟踪标签</div>
              <div className="flex flex-wrap gap-3">
                {trackers.map((tracker) => (
                  <label key={tracker.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={form.tracker_ids.includes(tracker.id)}
                      onChange={(e) => {
                        const tracker_ids = e.target.checked
                          ? [...form.tracker_ids, tracker.id]
                          : form.tracker_ids.filter((id) => id !== tracker.id)
                        setForm({ ...form, tracker_ids })
                      }}
                    />
                    {tracker.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_required}
              onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
            />
            必填
          </label>
        )}
      </FormDialog>
      {confirmDialog}
    </div>
  )
}

export function AdminEnumerationsPage() {
  const [type, setType] = useState('IssuePriority')
  const [items, setItems] = useState<Array<{ id: number; name: string; is_default: boolean; active?: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: number; name: string; is_default: boolean; active: boolean } | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDefault, setDraftDefault] = useState(false)
  const [draftActive, setDraftActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fields, setFields] = useState<Array<{ id: number; name: string; type: string; field_format: string }>>([])
  const [addingField, setAddingField] = useState(false)
  const [fieldName, setFieldName] = useState('')
  const dragIndex = useRef<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  const labels: Record<string, string> = {
    IssuePriority: '优先级',
    DocumentCategory: '文档分类',
    TimeEntryActivity: '时间活动',
  }
  const hints: Record<string, string> = {
    IssuePriority: '新建和编辑工单时选择。默认项会预先选中。拖动整行可以调整下拉顺序。',
    DocumentCategory: '上传项目文档时给文档归类。',
    TimeEntryActivity: '登记工时时选择活动类型，例如设计、开发。',
  }

  const customFields = fields.filter((field) => field.type === 'IssueCustomField' && field.field_format === 'enumeration')
  const custom = type.startsWith('custom_field:')
  const currentName = labels[type] || customFields.find((field) => `custom_field:${field.id}` === type)?.name || '枚举'

  async function loadFields() {
    const res = await api<{ fields: Array<{ id: number; name: string; type: string; field_format: string }> }>('/studio/custom_fields')
    setFields(res.fields ?? [])
  }

  async function load(nextType = type) {
    setLoading(true)
    setError(null)
    try {
      if (nextType.startsWith('custom_field:')) {
        const res = await api<{ items: typeof items }>(`/studio/enumerations?type=${encodeURIComponent(nextType)}`)
        setItems(res.items ?? [])
      } else {
        const key = {
          IssuePriority: 'issue_priorities',
          DocumentCategory: 'document_categories',
          TimeEntryActivity: 'time_entry_activities',
        }[nextType]
        const res = await api<Record<string, typeof items>>(`/enumerations/${nextType}.json`)
        setItems((key ? res[key] : []) ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFields()
  }, [])

  useEffect(() => {
    void load(type)
  }, [type])

  function openCreate() {
    setDraftName('')
    setDraftDefault(false)
    setDraftActive(true)
    setFormError(null)
    setCreating(true)
  }

  function openEdit(item: { id: number; name: string; is_default: boolean; active?: boolean }) {
    setDraftName(item.name)
    setDraftDefault(item.is_default)
    setDraftActive(item.active !== false)
    setFormError(null)
    setEditing({ id: item.id, name: item.name, is_default: item.is_default, active: item.active !== false })
  }

  async function persistOrder(reordered: typeof items) {
    setItems(reordered)
    setError(null)
    try {
      await api(`/studio/enumerations/reorder?type=${type}`, { method: 'PATCH', body: { ids: reordered.map((item) => item.id) } })
    } catch (err) {
      setError(err instanceof Error ? err.message : '调整顺序失败')
      await load()
    }
  }

  function dropOn(index: number) {
    const from = dragIndex.current
    dragIndex.current = null
    setOverIndex(null)
    if (from === null || from === index) return
    const reordered = [...items]
    const [item] = reordered.splice(from, 1)
    reordered.splice(index, 0, item)
    void persistOrder(reordered)
  }

  return (
    <div>
      <PageHeader
        title="枚举"
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setFieldName('')
                setFormError(null)
                setAddingField(true)
              }}
            >
              添加枚举字段
            </Button>
            <Button onClick={openCreate}>添加选项</Button>
          </div>
        }
      />
      <p className="mb-4 max-w-2xl text-sm text-gray-500">
        {hints[type] || `「${currentName}」是工单上的枚举字段。下面维护它的可选值，新建工单时会按这里的顺序出现。`}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-56">
          <option value="IssuePriority">优先级</option>
          <option value="DocumentCategory">文档分类</option>
          <option value="TimeEntryActivity">时间活动</option>
          {customFields.map((field) => (
            <option key={field.id} value={`custom_field:${field.id}`}>
              {field.name}
            </option>
          ))}
        </Select>
        {custom ? (
          <Button
            variant="danger"
            onClick={async () => {
              const id = type.slice('custom_field:'.length)
              const ok = await confirm({ title: '删除枚举字段', description: `确定删除「${currentName}」？字段和它的选项会一起去掉。正在使用的字段不能删除。` })
              if (!ok) return
              setError(null)
              try {
                await api(`/studio/custom_fields/${id}`, { method: 'DELETE' })
                setType('IssuePriority')
                await loadFields()
              } catch (err) {
                setError(err instanceof Error ? err.message : '删除字段失败')
              }
            }}
          >
            删除字段
          </Button>
        ) : null}
      </div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">这一类还没有枚举值。</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              aria-label={`拖动调整「${item.name}」的顺序`}
              className={['flex cursor-grab items-center justify-between gap-3 px-4 py-3 text-sm active:cursor-grabbing', overIndex === index ? 'bg-blue-50' : ''].join(' ')}
              onDragStart={(event) => {
                dragIndex.current = index
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                dragIndex.current = null
                setOverIndex(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setOverIndex(index)
              }}
              onDrop={() => dropOn(index)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="text-xs text-gray-400">{index + 1}</span>
                <span>
                  {item.name}
                  {item.is_default ? <span className="text-gray-400">（默认）</span> : null}
                  {item.active === false ? <span className="text-gray-400">（停用）</span> : null}
                </span>
              </span>
              <span className="flex gap-2">
                <Button
                  variant="secondary"
                  draggable={false}
                  onMouseDown={(event) => event.stopPropagation()}
                  onDragStart={(event) => event.preventDefault()}
                  onClick={() => openEdit(item)}
                >
                  编辑
                </Button>
                <Button
                  variant="danger"
                  draggable={false}
                  onMouseDown={(event) => event.stopPropagation()}
                  onDragStart={(event) => event.preventDefault()}
                  onClick={async () => {
                    const ok = await confirm({ title: `删除${currentName}`, description: `确定删除「${item.name}」？正在使用的值不能删除。` })
                    if (!ok) return
                    setError(null)
                    try {
                      await api(`/studio/enumerations/${item.id}?type=${type}`, { method: 'DELETE' })
                      await load()
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '删除失败')
                    }
                  }}
                >
                  删除
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <FormDialog
        open={creating || editing !== null}
        title={editing ? `编辑${currentName}` : `添加${currentName}选项`}
        submitLabel={editing ? '保存' : '创建'}
        saving={saving}
        error={formError}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSubmit={async (event) => {
          event.preventDefault()
          setSaving(true)
          setFormError(null)
          const body = { enumeration: { name: draftName.trim(), active: draftActive, is_default: draftDefault } }
          try {
            if (editing) {
              await api(`/studio/enumerations/${editing.id}?type=${type}`, { method: 'PATCH', body })
            } else {
              await api(`/studio/enumerations?type=${type}`, { method: 'POST', body })
            }
            setCreating(false)
            setEditing(null)
            await load()
          } catch (err) {
            setFormError(err instanceof Error ? err.message : '保存失败')
          } finally {
            setSaving(false)
          }
        }}
      >
        <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="名称" required maxLength={30} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={draftActive} onChange={(e) => setDraftActive(e.target.checked)} />
          启用
        </label>
        {custom ? null : (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={draftDefault} onChange={(e) => setDraftDefault(e.target.checked)} />
            设为默认
          </label>
        )}
      </FormDialog>
      <FormDialog
        open={addingField}
        title="添加枚举字段"
        submitLabel="创建"
        saving={saving}
        error={formError}
        onClose={() => setAddingField(false)}
        onSubmit={async (event) => {
          event.preventDefault()
          setSaving(true)
          setFormError(null)
          try {
            const res = await api<{ field: { id: number } }>('/studio/custom_fields', {
              method: 'POST',
              body: {
                type: 'IssueCustomField',
                custom_field: { name: fieldName.trim(), field_format: 'enumeration', is_for_all: true },
              },
            })
            setAddingField(false)
            await loadFields()
            setType(`custom_field:${res.field.id}`)
          } catch (err) {
            setFormError(err instanceof Error ? err.message : '创建字段失败')
          } finally {
            setSaving(false)
          }
        }}
      >
        <Input value={fieldName} onChange={(e) => setFieldName(e.target.value)} placeholder="字段名称，例如严重程度" required maxLength={30} />
        <p className="text-xs text-gray-500">创建后会出现在工单表单里。可选值在这个页面继续添加。</p>
      </FormDialog>
      {confirmDialog}
    </div>
  )
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void api<{ settings: Record<string, string> }>('/studio/settings').then((res) => {
      setSettings(res.settings ?? {})
      setLoading(false)
    })
  }, [])

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="系统配置" />
      <Card className="max-w-2xl space-y-4 p-4">
        <div>
          <label className="mb-1 block text-sm font-medium">应用标题</label>
          <Input
            value={settings.app_title ?? ''}
            onChange={(e) => setSettings({ ...settings, app_title: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">REST API</label>
          <Select
            value={settings.rest_api_enabled ?? '0'}
            onChange={(e) => setSettings({ ...settings, rest_api_enabled: e.target.value })}
          >
            <option value="1">启用</option>
            <option value="0">禁用</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">自助注册</label>
          <Select
            value={settings.self_registration ?? '0'}
            onChange={(e) => setSettings({ ...settings, self_registration: e.target.value })}
          >
            <option value="0">禁用</option>
            <option value="1">需激活</option>
            <option value="3">自动激活</option>
          </Select>
        </div>
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            await api('/studio/settings', { method: 'PATCH', body: { settings } })
            setSaving(false)
          }}
        >
          {saving ? '保存中…' : '保存'}
        </Button>
      </Card>
    </div>
  )
}
