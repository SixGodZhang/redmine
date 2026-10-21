import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import {
  CalendarDays,
  ChartColumn,
  FolderKanban,
  GanttChartSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  Search,
  Settings,
  Shield,
  Timer,
  Users,
  Workflow,
  BookOpen,
  MessageSquare,
  FileText,
  X,
} from 'lucide-react'
import { Fragment, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { IssueFormProvider, useIssueForm } from '../pages/issues/IssueFormPage'
import { useAuth } from '../lib/auth'
import { Button, Input } from './ui'

const nav = [
  { to: '/', label: '工作台', icon: LayoutDashboard },
  { to: '/projects', label: '项目', icon: FolderKanban },
  { to: '/issues', label: '工单', icon: FileText },
  { to: '/gantt', label: '甘特图', icon: GanttChartSquare },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/pm', label: 'PM', icon: ChartColumn },
]

const adminNav = [
  { to: '/admin/users', label: '用户', icon: Users },
  { to: '/admin/groups', label: '用户组', icon: Users },
  { to: '/admin/roles', label: '角色', icon: Shield },
  { to: '/admin/trackers', label: '跟踪标签', icon: Workflow },
  { to: '/admin/statuses', label: '工单状态', icon: FileText },
  { to: '/admin/workflows', label: '工作流', icon: Workflow },
  { to: '/admin/custom-fields', label: '自定义字段', icon: Settings },
  { to: '/admin/enumerations', label: '枚举', icon: Settings },
  { to: '/admin/settings', label: '系统配置', icon: Settings },
]

function NavItem({ to, label, icon: Icon, onClick }: { to: string; label: string; icon: typeof Menu; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100',
        ].join(' ')
      }
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {label}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="text-lg font-semibold text-gray-900">Studio</div>
        <div className="text-xs text-gray-500">Redmine 现代工作台</div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => (
          <NavItem key={item.to} {...item} onClick={onNavigate} />
        ))}
        {user?.admin ? (
          <>
            <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">管理</div>
            {adminNav.map((item) => (
              <NavItem key={item.to} {...item} onClick={onNavigate} />
            ))}
          </>
        ) : null}
      </nav>
      <div className="border-t border-gray-200 p-3">
        <div className="mb-2 truncate px-2 text-sm text-gray-700">
          {user?.firstname} {user?.lastname}
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={async () => {
            await logout()
            navigate('/login')
          }}
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </Button>
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <IssueFormProvider>
      <AppShellLayout />
    </IssueFormProvider>
  )
}

function AppShellLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { openCreate } = useIssueForm()

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white lg:block">
        <SidebarContent />
      </aside>

      <Transition show={mobileOpen} as={Fragment}>
        <Dialog className="relative z-50 lg:hidden" onClose={setMobileOpen}>
          <TransitionChild
            as={Fragment}
            enter="transition-opacity duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </TransitionChild>
          <div className="fixed inset-0 flex">
            <TransitionChild
              as={Fragment}
              enter="transition duration-200 ease-out"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition duration-200 ease-in"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <DialogPanel className="relative w-72 max-w-full bg-white shadow-xl">
                <button
                  type="button"
                  className="absolute right-3 top-3 rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                  onClick={() => setMobileOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
            }}
          >
            <Search className="hidden h-4 w-4 text-gray-400 sm:block" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索工单、Wiki、新闻…"
              className="max-w-xl"
            />
            <Button type="submit" variant="secondary" className="hidden sm:inline-flex">
              搜索
            </Button>
          </form>
          <Button className="hidden sm:inline-flex" onClick={() => openCreate()}>
            新建工单
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export const projectTabs = [
  { slug: 'overview', label: '概述', icon: LayoutDashboard },
  { slug: 'issues', label: '工单', icon: FileText },
  { slug: 'versions', label: '目标版本', icon: Settings },
  { slug: 'wiki', label: 'Wiki', icon: BookOpen },
  { slug: 'news', label: '新闻', icon: Newspaper },
  { slug: 'documents', label: '文档', icon: FileText },
  { slug: 'files', label: '文件', icon: FileText },
  { slug: 'boards', label: '讨论', icon: MessageSquare },
  { slug: 'time', label: '时间', icon: Timer },
]
