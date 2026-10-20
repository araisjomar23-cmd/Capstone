import { supabase } from '../../lib/supabase'
import { fetchActivities } from '../activities/activityService'
import type { Activity } from '../../types/activity'

export interface BudgetEntry {
  id: string
  activityId: string
  category: string
  description: string
  amount: number
  entryType: 'allocation' | 'expense'
  recordedAt: string
  recordedBy: string
}

export interface BudgetAuditEvent {
  id: number
  activityId: string
  budgetEntryId: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  actorEmail: string | null
  changedAt: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
}

export interface BudgetOverview {
  totalAlloc: number
  totalSpent: number
  totalRemain: number
  utilRate: number
  activities: Activity[]
  entriesByActivity: Record<string, BudgetEntry[]>
  auditByActivity: Record<string, BudgetAuditEvent[]>
}

interface BudgetAuditRecord {
  id: number
  activity_id: string
  budget_entry_id: string
  operation: BudgetAuditEvent['operation']
  actor_email: string | null
  changed_at: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
}

interface BudgetEntryRecord {
  id: string
  activity_id: string
  category: string | null
  description: string | null
  amount: number | string
  entry_type: 'allocation' | 'expense'
  recorded_at: string
  recorded_by: string | null
}

export async function fetchBudgetOverview(): Promise<BudgetOverview> {
  const acts = await fetchActivities()

  const { data: entries, error } = await supabase
    .from('budget_entries')
    .select('id, activity_id, category, description, amount, entry_type, recorded_at, recorded_by')
    .order('recorded_at', { ascending: false })
  if (error) throw new Error(`Unable to load budget entries: ${error.message}`)

  const { data: auditRows, error: auditError } = await supabase
    .from('budget_entry_audit')
    .select('id, activity_id, budget_entry_id, operation, actor_email, changed_at, old_values, new_values')
    .order('changed_at', { ascending: false })
  if (auditError) throw new Error(`Unable to load budget audit history: ${auditError.message}`)

  const allEntries: BudgetEntry[] = ((entries || []) as BudgetEntryRecord[]).map((e) => ({
    id: e.id,
    activityId: e.activity_id,
    category: e.category || '',
    description: e.description || '',
    amount: Number(e.amount) || 0,
    entryType: e.entry_type,
    recordedAt: e.recorded_at,
    recordedBy: e.recorded_by || 'Admin',
  }))

  const entriesByActivity: Record<string, BudgetEntry[]> = {}
  allEntries
    .filter((e) => e.entryType === 'expense')
    .forEach((e) => {
      if (!entriesByActivity[e.activityId]) entriesByActivity[e.activityId] = []
      entriesByActivity[e.activityId].push(e)
    })

  const auditByActivity: Record<string, BudgetAuditEvent[]> = {}
  for (const row of (auditRows || []) as BudgetAuditRecord[]) {
    if (!auditByActivity[row.activity_id]) auditByActivity[row.activity_id] = []
    auditByActivity[row.activity_id].push({
      id: row.id,
      activityId: row.activity_id,
      budgetEntryId: row.budget_entry_id,
      operation: row.operation,
      actorEmail: row.actor_email,
      changedAt: row.changed_at,
      oldValues: row.old_values,
      newValues: row.new_values,
    })
  }

  const totalAlloc = acts.reduce((s, a) => s + a.budgetAlloc, 0)
  const totalSpent = acts.reduce((s, a) => s + a.budgetSpent, 0)
  const totalRemain = totalAlloc - totalSpent
  const utilRate = totalAlloc > 0 ? Math.round((totalSpent / totalAlloc) * 100) : 0

  return { totalAlloc, totalSpent, totalRemain, utilRate, activities: acts, entriesByActivity, auditByActivity }
}

export async function saveBudgetEntry(
  activityId: string,
  entryType: 'allocation' | 'expense',
  amount: number,
  category: string,
  description: string,
  recordedBy = 'Admin'
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Enter a valid amount.' }
  }

  const { error } = await supabase.from('budget_entries').insert({
    activity_id: activityId,
    category: category || (entryType === 'allocation' ? 'Initial Budget' : 'Expense'),
    description: description || '',
    amount,
    entry_type: entryType,
    recorded_by: recordedBy,
    recorded_at: new Date().toISOString(),
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

export async function updateExpenseEntry(id: string, amount: number, category: string, description: string): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(amount) || amount <= 0 || !category.trim()) return { ok: false, error: 'Enter a valid positive amount and category.' }
  const { error } = await supabase.from('budget_entries')
    .update({ amount, category: category.trim(), description: description.trim() })
    .eq('id', id).eq('entry_type', 'expense')
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function deleteExpenseEntry(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('budget_entries').delete().eq('id', id).eq('entry_type', 'expense')
  return error ? { ok: false, error: error.message } : { ok: true }
}
