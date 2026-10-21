import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Button, Card, PageHeader, Spinner } from '../components/ui'

type CalEvent = {
  type: string
  id: number
  title: string
  date: string
  start_date?: string | null
  due_date?: string | null
  url?: string | null
}

const VISIBLE_EVENTS = 3

export function CalendarPage() {
  const [cursor, setCursor] = useState(new Date())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<{ day: Date; x: number; y: number } | null>(null)

  const year = cursor.getFullYear()
  const month = cursor.getMonth() + 1

  useEffect(() => {
    setLoading(true)
    void api<{ events: CalEvent[] }>(`/studio/calendar?year=${year}&month=${month}`).then((res) => {
      setEvents(res.events ?? [])
      setLoading(false)
    })
  }, [year, month])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [cursor])

  function eventBounds(event: CalEvent) {
    const start = event.start_date ? parseISO(event.start_date) : event.date ? parseISO(event.date) : null
    const end = event.due_date ? parseISO(event.due_date) : start
    if (!start || !end) return null
    return start <= end ? { start, end } : { start: end, end: start }
  }

  function eventsOn(day: Date) {
    return events.filter((event) => {
      const bounds = eventBounds(event)
      return bounds != null && day >= bounds.start && day <= bounds.end
    })
  }

  function openDay(day: Date, event: MouseEvent) {
    const list = eventsOn(day)
    if (list.length === 0) return
    setDetail({ day, x: event.clientX, y: event.clientY })
  }

  const detailEvents = detail ? eventsOn(detail.day) : []

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="日历"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setCursor(addMonths(cursor, -1))}>
              上月
            </Button>
            <span className="min-w-28 text-center text-sm font-medium">{format(cursor, 'yyyy年 M月', { locale: zhCN })}</span>
            <Button variant="secondary" onClick={() => setCursor(addMonths(cursor, 1))}>
              下月
            </Button>
          </div>
        }
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 text-center text-xs font-medium text-gray-500">
          {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const list = eventsOn(day)
            return (
              <div
                key={day.toISOString()}
                className={[
                  'relative min-h-24 border-b border-r border-gray-100 p-2 align-top text-xs',
                  isSameMonth(day, cursor) ? 'bg-white' : 'bg-gray-50 text-gray-400',
                ].join(' ')}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className="font-medium">{format(day, 'd')}</span>
                  {list.length > 0 ? (
                    <button type="button" className="shrink-0 text-blue-600 hover:underline" onClick={(event) => openDay(day, event)}>
                      {list.length > VISIBLE_EVENTS ? `还有 ${list.length - VISIBLE_EVENTS} 条` : `共 ${list.length} 条`}
                    </button>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {list.slice(0, VISIBLE_EVENTS).map((e) => (
                    <div key={`${e.type}-${e.id}-${e.date}`}>
                      {e.url ? (
                        <Link to={e.url} title={e.title} className="block truncate rounded bg-blue-50 px-1 py-0.5 text-blue-700">
                          {e.title}
                        </Link>
                      ) : (
                        <span title={e.title} className="block truncate rounded bg-purple-50 px-1 py-0.5 text-purple-700">{e.title}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
      {detail
        ? createPortal(
            <div className="fixed inset-0 z-[60]" onClick={() => setDetail(null)}>
              <div
                className="absolute max-h-80 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
                style={{
                  left: Math.min(detail.x, window.innerWidth - 300),
                  top: Math.min(detail.y, window.innerHeight - 220),
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900">{format(detail.day, 'M月d日')} · {detailEvents.length} 条</div>
                  <button type="button" className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setDetail(null)}>
                    关闭
                  </button>
                </div>
                <div className="space-y-1">
                  {detailEvents.map((event) =>
                    event.url ? (
                      <Link
                        key={`${event.type}-${event.id}-${event.date}`}
                        to={event.url}
                        className="block rounded bg-blue-50 px-2 py-1 text-sm break-words text-blue-700 hover:bg-blue-100"
                        onClick={() => setDetail(null)}
                      >
                        {event.title}
                      </Link>
                    ) : (
                      <div key={`${event.type}-${event.id}-${event.date}`} className="rounded bg-purple-50 px-2 py-1 text-sm break-words text-purple-700">
                        {event.title}
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
