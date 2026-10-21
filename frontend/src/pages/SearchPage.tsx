import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { EmptyState, Input, PageHeader, Spinner } from '../components/ui'

type Result = { id: number; title: string; type: string; url: string; description: string }

function resultPath(url: string, id: number) {
  try {
    const path = new URL(url, window.location.origin).pathname
    if (path.startsWith('/issues/')) return path
    if (path.startsWith('/app/issues/')) return path.slice('/app'.length)
    return `/issues/${id}`
  } catch {
    return `/issues/${id}`
  }
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [query, setQuery] = useState(q)
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!q) return
    setLoading(true)
    void api<{ results: Result[] }>(`/search.json?q=${encodeURIComponent(q)}&issues=1&news=1&documents=1&wiki_pages=1`)
      .then((res) => setResults(res.results ?? []))
      .finally(() => setLoading(false))
  }, [q])

  return (
    <div>
      <PageHeader title="搜索" />
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setParams({ q: query.trim() })
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入关键词" />
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">
          搜索
        </button>
      </form>
      {loading ? <Spinner /> : null}
      {!loading && q && results.length === 0 ? <EmptyState title="没有结果" /> : null}
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={`${r.type}-${r.id}`} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs uppercase text-gray-400">{r.type}</div>
            <Link to={resultPath(r.url, r.id)} className="font-medium text-blue-700 hover:underline">
              {r.title}
            </Link>
            {r.description ? <p className="mt-1 text-sm text-gray-600 line-clamp-2">{r.description}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
