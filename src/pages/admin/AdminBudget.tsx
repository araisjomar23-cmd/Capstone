import { ACTIVITY_STATUS_DISPLAY, getActivityDisplayStatus } from '../../features/activities/activityLifecycle'
import ActivityDateFilter from '../../components/ActivityDateFilter'
import { currentMonthPeriod, matchesDatePeriod, activityDateLabel } from '../../lib/activityDatePeriod'
import { useEffect, useRef, useState } from 'react'
import { budgetAmount, budgetProgramKey, summarizeBudgets } from '../../features/budget/budgetSummary'
import { deleteExpenseEntry, fetchBudgetOverview, saveBudgetEntry, updateExpenseEntry } from '../../features/budget/budgetService'
import type { BudgetAuditEvent, BudgetOverview } from '../../features/budget/budgetService'
import { Wallet, Plus, Coins, ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '../../components/ToastProvider'
import { SkeletonStatCard, SkeletonCard } from '../../components/Skeleton'
import type { Activity } from '../../types/activity'
import type { BudgetEntry } from '../../features/budget/budgetService'
import { supabase } from '../../lib/supabase'
import ApprovedBudgetPanel from '../../features/budget/ApprovedBudgetPanel'
import { fetchApprovedBudgets, type ApprovedBudgetVersion } from '../../features/budget/approvedBudgetService'
import ProposalBudgetPreview from '../../features/budget/ProposalBudgetPreview'

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

function ActivityBudgetStatus({ activity }: { activity: Activity }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const status = ACTIVITY_STATUS_DISPLAY[getActivityDisplayStatus(activity, now)]
  return <span className={`inline-flex my-1 rounded-full px-2 py-1 text-xs font-medium ${status.cls}`}>{status.label}</span>
}

function AdminBudget() {
  const [period, setPeriod] = useState(currentMonthPeriod)
  const [data, setData] = useState<BudgetOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)
  const [programFilter, setProgramFilter] = useState('')
  const latestRequest = useRef(0)

  useEffect(() => {
    load()
    const channel = supabase.channel(`budget-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_entries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'programs' }, () => load())
      .subscribe()
    return () => { latestRequest.current++; supabase.removeChannel(channel) }
  }, [])

  async function load() {
    const request = ++latestRequest.current
    setLoading(true)
    try {
      const d = await fetchBudgetOverview()
      if (request !== latestRequest.current) return
      setData(d)
      setLoadError('')
    } catch (cause) {
      if (request === latestRequest.current) setLoadError(cause instanceof Error ? cause.message : 'Unable to load budget data.')
    } finally {
      if (request === latestRequest.current) setLoading(false)
    }
  }

  if (!data) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold text-primary mb-6">Budget Monitor</h1>
        {loadError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{loadError} <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">Retry</button></div>}
        {!loadError && <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
        </div>
        <div className="space-y-6">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
        </>}
      </div>
    )
  }

  const periodActivities = data.activities.filter((a) => matchesDatePeriod(a.startDate, a.endDate, period))
  const programOptions = [...new Map(data.activities.map(activity => [budgetProgramKey(activity), activity.programName || 'Unassigned program'])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const activities = periodActivities.filter(activity => !programFilter || budgetProgramKey(activity) === programFilter)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
  const summary = summarizeBudgets(activities)
  const { allocated: totalAlloc, spent: totalSpent, remaining: totalRemain, utilization: utilRate } = summary
  const selectedActivity = selectedActivityId
    ? activities.find((a) => a.id === selectedActivityId) || null
    : null

  return (
    <div className="min-w-0 p-4 md:p-8" aria-busy={loading}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold text-primary">Budget Monitor</h1><ProposalBudgetPreview /></div>

      {loadError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{loadError} Showing previously loaded records. <button type="button" onClick={() => void load()} className="min-h-11 font-semibold underline">Retry</button></p>}
      <ActivityDateFilter value={period} onChange={(next) => { setPeriod(next); setSelectedActivityId(null) }} dates={data.activities.map((a) => ({ start: a.startDate, end: a.endDate }))}
        actions={<label className="block min-w-0 text-xs font-medium text-gray-600 sm:w-56">Program<select aria-label="Budget program" className="input filter-select mt-1.5 min-h-11 w-full min-w-0" value={programFilter} onChange={event => { setProgramFilter(event.target.value); setSelectedActivityId(null) }}><option value="">All Programs</option>{programOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>} />
      <p className="text-xs text-gray-500 mb-4">Showing {activities.length} of {periodActivities.length} activities in this period{programFilter ? ` · ${programOptions.find(([id]) => id === programFilter)?.[1] || 'Selected program'}` : ''}. Totals reflect the selected dates and program.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard barColor="var(--color-primary)" label="Allocated" value={`₱${totalAlloc.toLocaleString()}`} sub={`Across ${activities.length} activities`} />
        <StatCard barColor="var(--color-danger)" label="Spent" value={`₱${totalSpent.toLocaleString()}`} />
        <StatCard barColor="var(--color-teal)" label="Remaining" value={`₱${totalRemain.toLocaleString()}`} />
        <StatCard barColor="var(--color-accent)" label="Utilization" value={utilRate === null ? 'N/A' : `${utilRate}%`} sub={totalAlloc === 0 && totalSpent > 0 ? 'Spending recorded without allocation' : undefined} />
      </div>

      {activities.length === 0 ? (
        <div className="text-center text-gray-400 py-12">No activities match the selected dates{programFilter ? ' and program' : ''}. Try another period or choose All Programs.</div>
      ) : selectedActivity ? (
        <div>
          <button
            onClick={() => setSelectedActivityId(null)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4"
          >
            <ArrowLeft size={16} /> Back to all activities
          </button>
          <ActivityBudgetDetail
            key={selectedActivity.id}
            activity={selectedActivity}
            entries={data.entriesByActivity[selectedActivity.id] || []}
            auditEvents={data.auditByActivity[selectedActivity.id] || []}
            onSaved={load}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activities.map((a) => (
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
  const left = (budgetAmount(alloc) - budgetAmount(spent)) / 100
  const pct = alloc > 0 ? Math.round((spent / alloc) * 100) : 0

  return (
    <button
      onClick={onClick}
      className="panel p-4 text-left hover:shadow-md hover:border-primary/30 transition-all"
    >
      <div className="text-base font-bold text-gray-900 truncate">{a.title}</div>
      <ActivityBudgetStatus activity={a} />
      <div className="text-xs text-gray-400 mb-3 truncate">{a.programName}</div>
      <div className="text-xs text-gray-500 mb-3">{activityDateLabel(a.startDate, a.endDate)}</div>

      {alloc === 0 ? (
        <div className="text-sm text-gray-500">No budget allocated yet{spent > 0 && <p className="mt-2 font-semibold text-red-700">Spent: PHP {spent.toLocaleString()} · Remaining: PHP {left.toLocaleString()} · Spending without allocation</p>}</div>
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
            <div className={`h-2 rounded-full ${barColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </>
      )}
    </button>
  )
}

function ActivityBudgetDetail({
  activity: a,
  entries,
  auditEvents,
  onSaved,
}: {
  activity: Activity
  entries: BudgetEntry[]
  auditEvents: BudgetAuditEvent[]
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [allocInput, setAllocInput] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingEntry, setEditingEntry] = useState<BudgetEntry | null>(null)
  const [approvedItem, setApprovedItem] = useState('')
  const [unplannedReason, setUnplannedReason] = useState('')
  const [approvedVersions, setApprovedVersions] = useState<ApprovedBudgetVersion[]>([])
  const [approvalLoading, setApprovalLoading] = useState(Boolean(a.proposalId))
  const [approvalError, setApprovalError] = useState('')
  const [approvalRetry, setApprovalRetry] = useState(0)
  useEffect(() => {
    if (!a.proposalId) return
    let active = true
    fetchApprovedBudgets(a.id).then(versions => { if (active) { setApprovedVersions(versions); setApprovalError('') } }).catch(error => { if (active) setApprovalError(error.message) }).finally(() => { if (active) setApprovalLoading(false) })
    return () => { active = false }
  }, [a.id, a.proposalId, a.updatedAt, approvalRetry])
  const currentItems = approvedVersions[0]?.items || []
  const approvalUnavailable = Boolean(a.proposalId && (approvalLoading || approvalError || !approvedVersions.length))
  const itemName = (id: string) => approvedVersions.flatMap(version => version.items).find(item => item.line_id === id)?.description || 'Previously approved item'

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const activityStatus = getActivityDisplayStatus(a, now)
  const expenseRecordingClosed = activityStatus === 'closed' || activityStatus === 'completed'

  const alloc = a.budgetAlloc
  const spent = a.budgetSpent
  const left = (budgetAmount(alloc) - budgetAmount(spent)) / 100
  const pct = alloc > 0 ? Math.round((spent / alloc) * 100) : 0

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
    if (saving || approvalUnavailable) return
    const currentStatus = getActivityDisplayStatus(a)
    if (!editingEntry && (currentStatus === 'closed' || currentStatus === 'completed')) {
      return showToast('Expenses cannot be recorded for closed or completed activities.', 'error')
    }
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return showToast('Enter a valid positive amount.', 'error')
    if (!category) return showToast('Select a category.', 'error')
    if (a.proposalId && !approvedItem && unplannedReason.trim().length < 5) return showToast('Select an approved item or explain why this expense is unplanned.', 'error')
    const proposedSpend = spent - (editingEntry?.amount || 0) + amt
    setSaving(true)
    const result = editingEntry
      ? await updateExpenseEntry(editingEntry.id, amt, category, description, approvedItem || null, approvedItem ? '' : unplannedReason)
      : await saveBudgetEntry(a.id, 'expense', amt, category, description, 'Admin', approvedItem || null, approvedItem ? '' : unplannedReason)
    setSaving(false)
    if (result.ok) {
      setAmount('')
      setCategory('')
      setDescription('')
      setEditingEntry(null)
      setApprovedItem('')
      setUnplannedReason('')
      showToast(proposedSpend > alloc ? 'Expense saved. Warning: total spending exceeds the allocation.' : editingEntry ? 'Expense updated.' : 'Expense recorded.', proposedSpend > alloc ? 'info' : 'success')
      onSaved()
    } else {
      showToast('Failed: ' + result.error, 'error')
    }
  }

  function beginEdit(entry: BudgetEntry) {
    if (!window.confirm(`Do you want to edit this ${entry.category || 'budget'} entry?`)) return
    setEditingEntry(entry)
    setAmount(String(entry.amount))
    setCategory(entry.category)
    setDescription(entry.description)
    setApprovedItem(entry.approvedBudgetItemId || '')
    setUnplannedReason(entry.unplannedReason || '')
  }

  async function handleDelete(entry: BudgetEntry) {
    if (!window.confirm(`Delete this ${entry.category || 'expense'} entry?`)) return
    setSaving(true)
    const result = await deleteExpenseEntry(entry.id)
    setSaving(false)
    if (result.ok) { showToast('Expense deleted.', 'success'); onSaved() }
    else showToast(`Could not delete expense: ${result.error || 'Unknown error'}`, 'error')
  }

  if (alloc === 0 && !a.proposalId && !spent && !entries.length) {
    return (
      <div className="panel p-4 md:p-5">
        <div className="text-base font-bold text-gray-900">{a.title}</div>
      <ActivityBudgetStatus activity={a} />
        <div className="text-xs text-gray-400 mb-3">{a.programName}</div>
      <div className="text-xs text-gray-500 mb-3">{activityDateLabel(a.startDate, a.endDate)}</div>
        <div className="text-sm text-gray-400 mb-3">No budget allocated yet</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="number"
            min={0}
            placeholder="Set allocated budget (₱)"
            value={allocInput}
            step="0.01"
            onWheel={(e) => e.currentTarget.blur()}
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
      <ActivityBudgetStatus activity={a} />
          <div className="text-xs text-gray-400">{a.programName}</div>
      <div className="text-xs text-gray-500 mb-3">{activityDateLabel(a.startDate, a.endDate)}</div>
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

      {alloc === 0 && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">No budget allocated. {spent > 0 ? 'Spending is recorded without an allocation; review these expenses.' : 'Utilization is unavailable until an allocation is recorded.'}</p>}
      {alloc === 0 && !a.proposalId && <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input aria-label="Allocate budget" type="number" min="0" step="0.01" value={allocInput} onChange={event => setAllocInput(event.target.value)} placeholder="Set allocated budget (PHP)" className="input min-w-0 flex-1" />
        <button type="button" onClick={handleAllocate} disabled={saving} className="btn-primary min-h-11">Allocate</button>
      </div>}
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Utilization</span>
        <span className={pctColor(pct)}>{alloc > 0 ? `${pct}%` : 'N/A'}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-5">
        <div className={`h-2 rounded-full ${barColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>

      <div className="mb-4">
        {a.proposalId && (approvalLoading ? <p role="status" className="mb-5 text-sm text-gray-500">Loading approved budget…</p> : approvalError ? <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{approvalError} <button type="button" className="font-semibold underline" onClick={() => { setApprovalLoading(true); setApprovalRetry(value => value + 1) }}>Retry</button></p> : <ApprovedBudgetPanel versions={approvedVersions} entries={entries} />)}
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
                <th className="text-left py-1.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-4">
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
                    <td className="py-1.5 max-w-[240px] break-words">{e.description || '—'}{e.approvedBudgetItemId ? <p className="mt-1 text-[10px] text-primary">Approved item: {itemName(e.approvedBudgetItemId)}</p> : a.proposalId && <p className="mt-1 text-[10px] text-amber-800">{e.unplannedReason ? `Unplanned: ${e.unplannedReason}` : 'Awaiting item assignment'}</p>}</td>
                    <td className="py-1.5 font-semibold text-red-500">₱{e.amount.toLocaleString()}</td>
                    <td className="py-1.5 text-gray-400">{e.recordedBy}</td>
                    <td className="py-1.5">
                      <button type="button" onClick={() => beginEdit(e)} className="mr-2 text-primary" aria-label="Edit expense"><Pencil size={14} /></button>
                      <button type="button" onClick={() => void handleDelete(e)} disabled={saving} className="text-red-600 disabled:opacity-50" aria-label="Delete expense"><Trash2 size={14} /></button>
                    </td>
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
                  {a.proposalId && <p className="mb-2 break-words text-[11px] text-primary">{e.approvedBudgetItemId ? `Approved item: ${itemName(e.approvedBudgetItemId)}` : e.unplannedReason ? `Unplanned: ${e.unplannedReason}` : 'Awaiting item assignment'}</p>}
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
                  <div className="flex justify-end gap-3 mt-2">
                    <button type="button" onClick={() => beginEdit(e)} className="text-primary inline-flex items-center gap-1"><Pencil size={12} /> Edit</button>
                    <button type="button" onClick={() => void handleDelete(e)} disabled={saving} className="text-red-600 inline-flex items-center gap-1 disabled:opacity-50"><Trash2 size={12} /> Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="mb-4 rounded-lg border border-gray-200 p-3 sm:p-4">
        <h3 className="text-[11px] font-bold uppercase text-gray-500 tracking-wide mb-3">Change Audit History</h3>
        {auditEvents.length === 0 ? (
          <p className="text-xs text-gray-400">No changes recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {auditEvents.map((event) => {
              const previous = event.oldValues
              const current = event.newValues
              const snapshot = event.operation === 'DELETE' ? previous : current
              const amountValue = snapshot?.amount
              const amountText = amountValue == null ? '' : `₱${Number(amountValue).toLocaleString()}`
              const changedFrom = previous?.amount == null ? '' : ` from ₱${Number(previous.amount).toLocaleString()}`
              const actor = event.actorEmail || 'Unknown administrator'
              const action = event.operation === 'INSERT' ? 'created' : event.operation === 'UPDATE' ? 'updated' : 'deleted'
              return (
                <div key={event.id} className="border-l-2 border-primary/30 pl-3 text-xs">
                  <div className="font-semibold text-gray-800 capitalize">{action} {String(snapshot?.entry_type || 'budget entry')}</div>
                  <div className="text-gray-600">
                    {String(snapshot?.category || 'Uncategorized')}{amountText ? ` · ${amountText}${event.operation === 'UPDATE' ? changedFrom : ''}` : ''}
                  </div>
                  {snapshot?.description != null && String(snapshot.description) !== '' && (
                    <div className="text-gray-500 break-words">{String(snapshot.description)}</div>
                  )}
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {new Date(event.changedAt).toLocaleString('en-PH')} · {actor}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {expenseRecordingClosed && !editingEntry ? (
        <p role="status" className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">This activity is {ACTIVITY_STATUS_DISPLAY[activityStatus].label.toLowerCase()}. New expenses cannot be recorded.</p>
      ) : (
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
        <div className="text-[11px] font-bold uppercase text-gray-400 tracking-wide mb-2 flex items-center gap-1.5">
          <Coins size={12} /> {editingEntry ? 'Edit Expense' : 'Add Expense'}
        </div>
        {a.proposalId && <div className="mb-3 space-y-2"><label htmlFor="expense-approved-item" className="block text-xs font-semibold text-gray-700">Approved cost item</label><select id="expense-approved-item" value={approvedItem} disabled={saving || approvalUnavailable} onChange={event => setApprovedItem(event.target.value)} className="input"><option value="">Unplanned expense / not in the approved breakdown</option>{currentItems.map(item => <option key={item.line_id} value={item.line_id}>{item.description} · ₱{(item.quantity * item.unit_cost).toLocaleString()} approved</option>)}{editingEntry?.approvedBudgetItemId && !currentItems.some(item => item.line_id === editingEntry.approvedBudgetItemId) && <option value={editingEntry.approvedBudgetItemId}>{itemName(editingEntry.approvedBudgetItemId)} (earlier approval)</option>}</select>{!approvedItem && <><label htmlFor="unplanned-expense-reason" className="block text-xs font-semibold text-amber-800">Why is this expense outside the approved breakdown?</label><textarea id="unplanned-expense-reason" value={unplannedReason} maxLength={2000} rows={2} onChange={event => setUnplannedReason(event.target.value)} className="input resize-y" placeholder="Explain the need for this unplanned expense." /><p className="text-[11px] text-gray-500">This will be flagged as unplanned and included in actual spending.</p></>}</div>}
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
            step="0.01"
            onWheel={(e) => e.currentTarget.blur()}
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
        {Number(amount) > 0 && spent - (editingEntry?.amount || 0) + Number(amount) > alloc && (
          <p role="status" className="mb-2 text-xs text-amber-700">Warning: this expense will put total spending above the allocated budget.</p>
        )}
        {approvedItem && Number(amount) > 0 && (() => {
          const item = currentItems.find(item => item.line_id === approvedItem)
          const itemSpent = entries.filter(entry => entry.approvedBudgetItemId === approvedItem && entry.id !== editingEntry?.id).reduce((sum, entry) => sum + entry.amount, 0) + Number(amount)
          return item && itemSpent > item.quantity * item.unit_cost ? <p role="status" className="mb-2 text-xs text-amber-700">This expense will exceed the approved cost for {item.description}.</p> : null
        })()}
        <button
          onClick={handleExpense}
          disabled={saving || approvalUnavailable}
          className="w-full btn-primary inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
          <Plus size={14} /> {editingEntry ? 'Save Expense' : 'Record Expense'}
        </button>
        {editingEntry && <button type="button" onClick={() => { setEditingEntry(null); setAmount(''); setCategory(''); setDescription(''); setApprovedItem(''); setUnplannedReason('') }} className="w-full mt-2 text-sm text-gray-500">Cancel edit</button>}
      </div>
      )}
    </div>
  )
}

export default AdminBudget
