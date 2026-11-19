import type { ReportData } from './reportService'

export function attendanceRate(data: ReportData) {
  return data.totalRegistered ? (data.totalAttended / data.totalRegistered) * 100 : null
}
export function evaluationCount(data: ReportData) {
  return data.evalRows.reduce((sum, row) => sum + row.responses, 0)
}
export function buildAdvancedInsights(current: ReportData, previous: ReportData | null) {
  const results = [...current.insights]
  const currentAttendance = attendanceRate(current)
  const previousAttendance = previous ? attendanceRate(previous) : null
  if (currentAttendance !== null && previousAttendance !== null) {
    const change = currentAttendance - previousAttendance
    if (Math.abs(change) >= 5) {
      results.push(`Attendance ${change > 0 ? 'improved' : 'fell'} by ${Math.abs(change).toFixed(0)} percentage points compared with the previous month (${previousAttendance.toFixed(0)}% to ${currentAttendance.toFixed(0)}%).`)
    }
  }

  const ratedActivities = current.evalRows.filter((row) => Number.isFinite(Number(row.avgRating)))
  if (ratedActivities.length) {
    const bestRated = [...ratedActivities].sort((a, b) => Number(b.avgRating) - Number(a.avgRating))[0]
    results.push(`Highest-rated activity: ${bestRated.title} at ${bestRated.avgRating}/5 from ${bestRated.responses} evaluation${bestRated.responses === 1 ? '' : 's'}.`)
  }

  const attendanceByActivity = current.activityRows
    .filter((row) => row.registered > 0)
    .map((row) => ({ ...row, rate: (row.attended / row.registered) * 100 }))
    .sort((a, b) => a.rate - b.rate)
  if (attendanceByActivity.length) {
    const lowest = attendanceByActivity[0]
    if (lowest.rate < 70) {
      results.push(`${lowest.title} had the lowest attendance (${lowest.rate.toFixed(0)}%, ${lowest.attended} of ${lowest.registered} registered). Consider reviewing reminders, timing, or access barriers.`)
    }
  }

  const evaluations = evaluationCount(current)
  if (current.totalAttended > 0) {
    const responseRate = (evaluations / current.totalAttended) * 100
    if (responseRate < 50) {
      results.push(`Evaluation response coverage is ${responseRate.toFixed(0)}% (${evaluations} responses for ${current.totalAttended} attendees). Consider setting aside time for feedback before participants leave.`)
    }
  }

  if (current.topBarangays[0]) {
    results.push(`Most represented barangay: ${current.topBarangays[0].label} (${current.topBarangays[0].count} registrations). Use this to compare reach across communities.`)
  }

  const commentAnalysis = current.feedbackAnalysis
  if (commentAnalysis.analyzedComments >= 3) {
    const negativeShare = commentAnalysis.sentimentCounts.negative / commentAnalysis.analyzedComments
    const positiveShare = commentAnalysis.sentimentCounts.positive / commentAnalysis.analyzedComments
    if (negativeShare >= 0.3) {
      const mainTheme = commentAnalysis.themeCounts[0]?.theme
      results.push(`Suggested text analysis found negative signals in ${Math.round(negativeShare * 100)}% of ${commentAnalysis.analyzedComments} written comments${mainTheme ? `; ${mainTheme} is the most-mentioned feedback theme` : ''}. Review the comments for context.`)
    } else if (positiveShare >= 0.6) {
      results.push(`Suggested text analysis found mostly positive signals in ${Math.round(positiveShare * 100)}% of written comments. Review the comments to identify practices worth repeating.`)
    }
  }

  return [...new Set(results)]
}
