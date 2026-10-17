import { useEffect, useState } from 'react'
import { fetchEvaluations } from '../../features/evaluations/evaluationService'
import type { EvaluationRow, EvaluationStats } from '../../features/evaluations/evaluationService'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { Star } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import { MessageSquareText } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5 shrink-0">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          className={n <= rating ? 'fill-amber-500 text-amber-500' : 'fill-gray-200 text-gray-200'}
        />
      ))}
    </span>
  )
}

function AdminEvaluations() {
  const [stats, setStats] = useState<EvaluationStats>({ totalResponses: 0, averageRating: 0, recommendRate: 0 })
  const [rows, setRows] = useState<EvaluationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
  load()

  const channel = supabase
    .channel(`evaluations-live-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluations' }, () => load())
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [])

  async function load() {
    setLoading(true)
    const { stats: s, rows: r } = await fetchEvaluations()
    setStats(s)
    setRows(r)
    setLoading(false)
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Evaluations & Feedback</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow p-4 sm:p-5 border border-gray-100">
          <div className="text-sm text-gray-500">Total Responses</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{loading ? '—' : stats.totalResponses}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 sm:p-5 border border-gray-100">
          <div className="text-sm text-gray-500">Average Rating</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {loading ? '—' : stats.averageRating.toFixed(1)}
          </div>
          <div className="text-xs text-gray-400 mt-1">Out of 5.0 stars</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 sm:p-5 border border-gray-100">
          <div className="text-sm text-gray-500">Would Recommend</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{loading ? '—' : `${stats.recommendRate}%`}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 font-bold text-gray-900">All Feedback</div>
        <div className="divide-y divide-gray-50">
          {loading ? (
              <div className="text-center text-gray-400 py-10">Loading…</div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<MessageSquareText size={22} />}
                title="No feedback submitted yet"
                subtitle="Feedback will appear here once participants complete the evaluation form."/>
            ) : (
            rows.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-1">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{r.participantName}</div>
                    <div className="text-xs text-gray-400 truncate">{r.activityTitle}</div>
                  </div>
                  <Stars rating={r.rating} />
                </div>
                {r.feedback && <p className="text-sm text-gray-600 mt-2 break-words">{r.feedback}</p>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <span className={`text-xs font-medium ${r.wouldRecommend ? 'text-green-600' : 'text-gray-400'}`}>
                    {r.wouldRecommend ? (
                    <span className="inline-flex items-center gap-1"><ThumbsUp size={12} /> Would recommend</span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><ThumbsDown size={12} /> Would not recommend</span>
                  )}
                  </span>
                  <span className="text-xs text-gray-300">
                    {new Date(r.submittedAt).toLocaleDateString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminEvaluations