/** Combine legacy description fields without losing existing activity details. */
export function activityDescription(preview?: string | null, full?: string | null): string {
  const summary = preview?.trim() || ''
  const details = full?.trim() || ''
  if (!summary) return details
  if (!details || summary.includes(details)) return summary
  if (details.includes(summary)) return details
  return `${summary}\n\n${details}`
}
