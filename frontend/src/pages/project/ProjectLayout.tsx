import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { api, type Project } from '../../lib/api'
import { projectTabs } from '../../components/AppShell'
import { Spinner } from '../../components/ui'

export function ProjectLayout() {
  const { identifier } = useParams()
  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    void api<{ project: Project }>(`/projects/${identifier}.json?include=trackers`).then((res) => {
      setProject(res.project)
    })
  }, [identifier])

  if (!project) return <Spinner />

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">{project.name}</h1>
        <p className="text-sm text-gray-500">{project.identifier}</p>
      </div>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
        {projectTabs.map((tab) => (
          <NavLink
            key={tab.slug}
            to={`/projects/${identifier}/${tab.slug}`}
            end={tab.slug === 'overview'}
            className={({ isActive }) =>
              [
                'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium',
                isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50',
              ].join(' ')
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet context={{ project }} />
    </div>
  )
}
