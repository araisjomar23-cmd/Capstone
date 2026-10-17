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

export interface BudgetOverview {
  totalAlloc: number
  totalSpent: number
  totalRemain: number
  utilRate: number
  activities: Activity[]
  entriesByActivity: Record<string, BudgetEntry[]>
}

export async function fetchBudgetOverview(): Promise<BudgetOverview> {
  const acts = await fetchActivities()

  const { data: entries } = await supabase
    .from('budget_entries')
    .select('id, activity_id, category, description, amount, entry_type, recorded_at, recorded_by')
    .order('recorded_at', { ascending: false })

  const allEntries: BudgetEntry[] = (entries || []).map((e: any) => ({
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

  const totalAlloc = acts.reduce((s, a) => s + a.budgetAlloc, 0)
  const totalSpent = acts.reduce((s, a) => s + a.budgetSpent, 0)
  const totalRemain = totalAlloc - totalSpent
  const utilRate = totalAlloc > 0 ? Math.round((totalSpent / totalAlloc) * 100) : 0

  return { totalAlloc, totalSpent, totalRemain, utilRate, activities: acts, entriesByActivity }
}

export async function saveBudgetEntry(
  activityId: string,
  entryType: 'allocation' | 'expense',
  amount: number,
  category: string,
  description: string,
  recordedBy = 'Admin'
): Promise<{ ok: boolean; error?: string }> {
  if (amount <= 0) {
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