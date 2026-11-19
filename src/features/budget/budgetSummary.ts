import type { Activity } from '../../types/activity'

export function budgetProgramKey(activity: Activity) {
  return activity.programId || activity.programName || 'unassigned'
}

/** Sum ledger amounts in centavos so decimal additions do not drift. */
export function budgetAmount(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error('A budget amount is invalid. Please check the recorded entries.')
  return Math.round((amount + Number.EPSILON) * 100)
}

export function summarizeBudgets(activities: Activity[]) {
  const groups = new Map<string, { id: string; name: string; activities: number; allocatedCents: number; spentCents: number }>()
  let allocatedCents = 0, spentCents = 0
  for (const activity of activities) {
    const id = budgetProgramKey(activity)
    const group = groups.get(id) ?? { id, name: activity.programName || 'Unassigned program', activities: 0, allocatedCents: 0, spentCents: 0 }
    const allocated = budgetAmount(activity.budgetAlloc), spent = budgetAmount(activity.budgetSpent)
    allocatedCents += allocated; spentCents += spent
    group.activities++; group.allocatedCents += allocated; group.spentCents += spent
    groups.set(id, group)
  }
  const amounts = (allocated: number, spent: number) => ({ allocated: allocated / 100, spent: spent / 100, remaining: (allocated - spent) / 100, utilization: allocated > 0 ? Math.round(spent / allocated * 100) : null })
  return {
    ...amounts(allocatedCents, spentCents),
    programs: [...groups.values()].map(group => ({ id: group.id, name: group.name, activities: group.activities, ...amounts(group.allocatedCents, group.spentCents) })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  }
}
