import type { Registration } from '../../types/registration'

/** Never join people by names, contact numbers or demographic similarities. */
export function participantKey(row: Registration): string {
  return row.userUuid ? `user:${row.userUuid}` : `registration:${row.id}`
}

export function participationHistory(participant: Registration, rows: Registration[]): Registration[] {
  const key = participantKey(participant)
  const unique = new Map(rows.filter(row => row.activityId && row.status !== 'not_registered' && participantKey(row) === key).map(row => [row.id, row]))
  return [...unique.values()].sort((a, b) => (b.activityStartDate || b.registeredAt).localeCompare(a.activityStartDate || a.registeredAt) || b.registeredAt.localeCompare(a.registeredAt) || a.id.localeCompare(b.id))
}

export function participationTotals(rows: Registration[]) {
  const registrations = rows.filter(row => row.activityId && row.status !== 'not_registered')
  return {
    youths: new Set(rows.map(participantKey)).size,
    registrations: registrations.length,
    attended: registrations.filter(row => row.status === 'attended' || row.status === 'completed').length,
    absent: registrations.filter(row => row.status === 'absent').length,
    programs: new Set(registrations.map(programKey).filter(Boolean)).size,
  }
}

export function programKey(row: Registration): string {
  return row.activityId ? row.programId || (row.program && row.program !== '—' ? row.program : '') : ''
}
