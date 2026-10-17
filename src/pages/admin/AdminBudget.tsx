import { useEffect, useState } from 'react'
import { fetchBudgetOverview, saveBudgetEntry } from '../../features/budget/budgetService'
import type { BudgetOverview } from '../../features/budget/budgetService'
import { Wallet, Plus, Coins, ArrowLeft } from 'lucide-react'
import { useToast } from '../../components/ToastProvider'
import { SkeletonStatCard, SkeletonCard } from '../../components/Skeleton'
import type { Activity } from '../../types/activity'
import type { BudgetEntry } from '../../features/budget/budgetService'

const EXPENSE_CATEGORIES = [
  'Food & Catering',
  'Transportation',
  'Venue & Rental',
  'Supplies & Materials',
  'Honorarium',
  'Printing',
  'Others',
]

function barColor(pct: number) {
  if (pct >= 80) return 'bg-red-500'
  if (pct >= 50) return 'bg-amber-500'
  return 'bg-green-500'
}

function pctColor(pct: number) {
  if (pct >= 80) return 'text-red-500'
  if (pct >= 50) return 'text-amber-500'
  return 'text-primary'
}

function AdminBudget() {
  const [data, setData] = useState<BudgetOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const d = await fetchBudgetOverview()
    setData(d)
    setLoading(false)
  }

  if (loading || !data) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold text-primary mb-6">Budget Monitor</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
        </div>
        <div className="space-y-6">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      </div>
    )
  }

  const selectedActivity = selectedActivityId
    ? data.activities.find((a) => a.id === selectedActivityId) || null
    : null

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Budget Monitor</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard barColor="var(--color-primary)" label="Allocated" value={`₱${data.totalAlloc.toLocaleString()}`} sub={`Across ${data.activities.length} activities`} />
        <StatCard barColor="var(--color-danger)" label="Spent" value={`₱${data.totalSpent.toLocaleString()}`} />
        <StatCard barColor="var(--color-teal)" label="Remaining" value={`₱${Math.max(0, data.totalRemain).toLocaleString()}`} />
        <StatCard barColor="var(--color-accent)" label="Utilization" value={`${data.utilRate}%`} />
      </div>

      {data.activities.length === 0 ? (
        <div className="text-center text-gray-400 py-12">No activities with budget data yet.</div>
      ) : selectedActivity ? (
        <div>
          <button
            onClick={() => setSelectedActivityId(null)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4"
          >
            <ArrowLeft size={16} /> Back to all activities
          </button>
          <ActivityBudgetDetail
            activity={selectedActivity}
            entries={data.entriesByActivity[selectedActivity.id] || []}
            onSaved={load}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.activities.map((a) => (
            <ActivityBudgetSummaryCard
              key={a.id}
              activity={a}
              onClick={() => setSelectedActivityId(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ barColor, label, value, sub }: { barColor: string; label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-accent-bar" style={{ background: barColor }} />
      <div className="stat-label">{label}</div>
      <div className="stat-value !text-2xl">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function ActivityBudgetSummaryCard({
  activity: a,
  onClick,
}: {
  activity: Activity
  onClick: () => void
}) {
  const alloc = a.budgetAlloc
  const spent = a.budgetSpent
  const left = Math.max(0, alloc - spent)
  const pct = alloc > 0 ? Math.min(100, Math.round((spent / alloc) * 100)) : 0

  return (
    <button
      onClick={onClick}
      className="panel p-4 text-left hover:shadow-md hover:border-primary/30 transition-all"
    >
      <div className="text-base font-bold text-gray-900 truncate">{a.title}</div>
      <div className="text-xs text-gray-400 mb-3 truncate">{a.programName}</div>

      {alloc === 0 ? (
        <div className="text-sm text-gray-400">No budget allocated yet</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <div className="text-[10px] uppercase text-gray-400 tracking-wide">Allocated</div>
              <div className="text-sm font-bold text-primary">₱{alloc.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-400 tracking-wide">Spent</div>
              <div className="text-sm font-bold text-red-500">₱{spent.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-400 tracking-wide">Remaining</div>
              <div className="text-sm font-bold text-primary">₱{left.toLocaleString()}</div>
            </div>
          </div>

          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Utilization</span>
            <span className={pctColor(pct)}>{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className={`h-2 rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </button>
  )
}

function ActivityBudgetDetail({
  activity: a,
  entries,
  onSaved,
}: {
  activity: Activity
  entries: BudgetEntry[]
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [allocInput, setAllocInput] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const alloc = a.budgetAlloc
  const spent = a.budgetSpent
  const left = Math.max(0, alloc - spent)
  const pct = alloc > 0 ? Math.min(100, Math.round((spent / alloc) * 100)) : 0

  async function handleAllocate() {
    const amt = Number(allocInput)
    if (!amt || amt <= 0) return showToast('Enter a valid amount.', 'error')
    setSaving(true)
    const result = await saveBudgetEntry(a.id, 'allocation', amt, 'Initial Budget', '')
    setSaving(false)
    if (result.ok) {
      setAllocInput('')
      showToast('Budget allocated.', 'success')
      onSaved()
    } else {
      showToast('Failed: ' + result.error, 'error')
    }
  }

  async function handleExpense() {
    const amt = Number(amount)
    if (!amt || amt <= 0) return showToast('Enter a valid amount.', 'error')
    if (!category) return showToast('Select a category.', 'error')
    setSaving(true)
    const result = await saveBudgetEntry(a.id, 'expense', amt, category, description)
    setSaving(false)
    if (result.ok) {
      setAmount('')
      setCategory('')
      setDescription('')
      showToast('Expense recorded.', 'success')
      onSaved()
    } else {
      showToast('Failed: ' + result.error, 'error')
    }
  }

  if (alloc === 0) {
    return (
      <div className="panel p-4 md:p-5">
        <div className="text-base font-bold text-gray-900">{a.title}</div>
        <div className="text-xs text-gray-400 mb-3">{a.programName}</div>
        <div className="text-sm text-gray-400 mb-3">No budget allocated yet</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="number"
            min={0}
            placeholder="Set allocated budget (₱)"
            value={allocInput}
            onChange={(e) => setAllocInput(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={handleAllocate}
            disabled={saving}
            className="btn-primary inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Wallet size={14} /> Allocate
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="panel p-4 md:p-5">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-3">
        <div>
          <div className="text-base font-bold text-gray-900">{a.title}</div>
          <div className="text-xs text-gray-400">{a.programName}</div>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:flex sm:gap-5">
          <div className="text-center">
            <div className="text-[10px] uppercase text-gray-400 tracking-wide">Allocated</div>
            <div className="text-sm sm:text-base font-bold text-primary">₱{alloc.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase text-gray-400 tracking-wide">Spent</div>
            <div className="text-sm sm:text-base font-bold text-red-500">₱{spent.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase text-gray-400 tracking-wide">Remaining</div>
            <div className="text-sm sm:text-base font-bold text-primary">₱{left.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Utilization</span>
        <span className={pctColor(pct)}>{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-5">
        <div className={`h-2 rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mb-4">
        <div className="text-[11px] font-bold uppercase text-gray-400 tracking-wide mb-2">
          Transaction History
        </div>

        {/* Desktop table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="min-w-full text-xs">
            <thead className="text-gray-400">
              <tr>
                <th className="text-left py-1.5">Date & Time</th>
                <th className="text-left py-1.5">Category</th>
                <th className="text-left py-1.5">Description</th>
                <th className="text-left py-1.5">Amount</th>
                <th className="text-left py-1.5">Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-4">
                    No expenses recorded yet.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="border-t border-gray-50">
                    <td className="py-1.5">
                      {new Date(e.recordedAt).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-1.5">{e.category || '—'}</td>
                    <td className="py-1.5 max-w-[200px] truncate">{e.description || '—'}</td>
                    <td className="py-1.5 font-semibold text-red-500">₱{e.amount.toLocaleString()}</td>
                    <td className="py-1.5 text-gray-400">{e.recordedBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile list */}
        <div className="md:hidden">
          {entries.length === 0 ? (
            <div className="text-center text-gray-400 py-4 text-xs">No expenses recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div key={e.id} className="bg-gray-50 rounded-lg p-3 text-xs">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-gray-800">{e.category || '—'}</span>
                    <span className="font-semibold text-red-500">₱{e.amount.toLocaleString()}</span>
                  </div>
                  {e.description && <div className="text-gray-500 mb-1">{e.description}</div>}
                  <div className="flex justify-between text-gray-400 text-[11px]">
                    <span>
                      {new Date(e.recordedAt).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span>{e.recordedBy}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
        <div className="text-[11px] font-bold uppercase text-gray-400 tracking-wide mb-2 flex items-center gap-1.5">
          <Coins size={12} /> Add Expense
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select Category</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            placeholder="Amount (₱)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <input
          type="text"
          placeholder="Description (e.g. Lunch for 30 pax)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
        />
        <button
          onClick={handleExpense}
          disabled={saving}
          className="w-full btn-primary inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
          <Plus size={14} /> Record Expense
        </button>
      </div>
    </div>
  )
}

export default AdminBudget