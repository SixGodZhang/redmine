import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useAuth } from './lib/auth'
import { Spinner } from './components/ui'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { IssuesListPage } from './pages/issues/IssuesListPage'
import { IssueDetailPage } from './pages/issues/IssueDetailPage'
import { IssueFormPage } from './pages/issues/IssueFormPage'
import { ProjectLayout } from './pages/project/ProjectLayout'
import {
  ProjectBoardsPage,
  ProjectDocumentsPage,
  ProjectFilesPage,
  ProjectIssuesPage,
  ProjectVersionsPage,
  ProjectNewsPage,
  ProjectOverviewPage,
  ProjectTimePage,
  ProjectWikiPage,
} from './pages/project/ProjectPages'
import { ProjectSettingsPage } from './pages/project/ProjectSettingsPage'
import { SearchPage } from './pages/SearchPage'
import { GanttPage } from './pages/GanttPage'
import { CalendarPage } from './pages/CalendarPage'
import { PmPage } from './pages/PmPage'
import { KanbanPage } from './pages/KanbanPage'
import {
  AdminCustomFieldsPage,
  AdminEnumerationsPage,
  AdminGroupsPage,
  AdminRolesPage,
  AdminSettingsPage,
  AdminStatusesPage,
  AdminTrackersPage,
  AdminUsersPage,
  AdminWorkflowsPage,
} from './pages/admin/AdminPages'

function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:identifier" element={<ProjectLayout />}>
            <Route index element={<Navigate to="issues" replace />} />
            <Route path="overview" element={<ProjectOverviewPage />} />
            <Route path="issues" element={<ProjectIssuesPage />} />
            <Route path="settings" element={<ProjectSettingsPage />} />
            <Route path="versions" element={<ProjectVersionsPage />} />
            <Route path="wiki" element={<ProjectWikiPage />} />
            <Route path="news" element={<ProjectNewsPage />} />
            <Route path="documents" element={<ProjectDocumentsPage />} />
            <Route path="files" element={<ProjectFilesPage />} />
            <Route path="boards" element={<ProjectBoardsPage />} />
            <Route path="time" element={<ProjectTimePage />} />
          </Route>
          <Route path="issues" element={<IssuesListPage />} />
          <Route path="issues/new" element={<IssueFormPage />} />
          <Route path="issues/:id" element={<IssueDetailPage />} />
          <Route path="issues/:id/edit" element={<IssueFormPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="gantt" element={<GanttPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="pm" element={<PmPage />} />
          <Route path="kanban" element={<KanbanPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/groups" element={<AdminGroupsPage />} />
          <Route path="admin/roles" element={<AdminRolesPage />} />
          <Route path="admin/trackers" element={<AdminTrackersPage />} />
          <Route path="admin/statuses" element={<AdminStatusesPage />} />
          <Route path="admin/workflows" element={<AdminWorkflowsPage />} />
          <Route path="admin/custom-fields" element={<AdminCustomFieldsPage />} />
          <Route path="admin/enumerations" element={<AdminEnumerationsPage />} />
          <Route path="admin/settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
