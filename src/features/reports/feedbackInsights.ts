import type { ReportData } from './reportService'

const THEME_ACTIONS: Record<string, string> = {
  venue: 'Review venue comfort, accessibility, and facilities.',
  schedule: 'Review the schedule, session length, and delays.',
  food: 'Review food and refreshment arrangements.',
  facilitators: 'Review speaker delivery and participant support.',
  content: 'Review session relevance, clarity, and practical activities.',
}

export function buildFeedbackInsights(analysis: ReportData['feedbackAnalysis']): string[] {
  if (!analysis.analyzedComments) return []
  const counts = analysis.sentimentCounts
  const insights = [
    `NLP analyzed ${analysis.analyzedComments} written comment${analysis.analyzedComments === 1 ? '' : 's'}: ${counts.positive} positive, ${counts.negative} negative, ${counts.mixed} mixed, and ${counts['no-signal']} without a clear sentiment.`,
  ]
  if (analysis.analyzedComments < 3) insights.push('Fewer than 3 written comments are available. Treat these as individual observations, not an overall participant trend.')
  if (counts['no-signal']) insights.push(`${counts['no-signal']} comment${counts['no-signal'] === 1 ? ' needs' : 's need'} manual review because NLP could not identify a clear sentiment. Read the original wording below.`)
  for (const theme of analysis.themeCounts) {
    const concerns = theme.sentimentCounts.negative + theme.sentimentCounts.mixed
    if (concerns && THEME_ACTIONS[theme.theme]) {
      insights.push(`NLP flagged ${concerns} comment${concerns === 1 ? '' : 's'} with negative or mixed signals about ${theme.theme}. ${THEME_ACTIONS[theme.theme]} Confirm the concern in the original comments before acting.`)
    }
  }
  return insights
}
