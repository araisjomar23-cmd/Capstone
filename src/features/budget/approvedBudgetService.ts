import { supabase } from '../../lib/supabase'
import type { BudgetEntry } from './budgetService'
import type { ProposalDocument } from '../proposals/proposalModel'

export interface ApprovedBudgetItem {
  publication_id: string; line_id: string; position: number; description: string; quantity: number; unit_cost: number
}
export interface ApprovedBudgetVersion {
  id: string; proposal_id: string; activity_id: string; revision: number; document_version: number; allocation: number; published_at: string
  items: ApprovedBudgetItem[]; files: ProposalDocument['files']
}
export async function fetchApprovedBudgets(activityId: string): Promise<ApprovedBudgetVersion[]> {
  const { data, error } = await supabase.from('ppa_budget_versions').select('*').eq('activity_id', activityId).order('revision', { ascending: false })
  if (error) throw new Error(`Unable to load approved budget: ${error.message}`)
  if (!data?.length) return []
  const [items, documents] = await Promise.all([
    supabase.from('ppa_budget_items').select('*').in('publication_id', data.map(row => row.id)).order('position'),
    supabase.from('ppa_documents').select('version, files').eq('proposal_id', data[0].proposal_id),
  ])
  if (items.error || documents.error) throw new Error(`Unable to load approved costs: ${items.error?.message || documents.error?.message}`)
  return data.map(row => ({ ...row, allocation: Number(row.allocation),
    items: (items.data || []).filter(item => item.publication_id === row.id).map(item => ({ ...item, quantity: Number(item.quantity), unit_cost: Number(item.unit_cost) })),
    files: documents.data?.find(document => document.version === row.document_version)?.files || [],
  }))
}

export function compareApprovedBudget(version: ApprovedBudgetVersion, entries: BudgetEntry[]) {
  const lines = version.items.map(item => {
    const approved = Math.round(item.quantity * item.unit_cost * 100) / 100
    const spent = entries.filter(entry => entry.approvedBudgetItemId === item.line_id).reduce((sum, entry) => sum + entry.amount, 0)
    return { ...item, approved, spent, difference: approved - spent }
  })
  const ids = new Set(version.items.map(item => item.line_id))
  return { lines,
    priorItems: entries.filter(entry => entry.approvedBudgetItemId && !ids.has(entry.approvedBudgetItemId)),
    unplanned: entries.filter(entry => !entry.approvedBudgetItemId && entry.unplannedReason),
    unassigned: entries.filter(entry => !entry.approvedBudgetItemId && !entry.unplannedReason),
  }
}
