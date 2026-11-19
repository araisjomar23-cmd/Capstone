import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFeedbackInsights } from '../src/features/reports/feedbackInsights.ts'
import { buildAdvancedInsights } from '../src/features/reports/insightModel.ts'
import type { ReportData } from '../src/features/reports/reportService.ts'

test('missing comparison data never produces a fabricated month-over-month change', () => {
  const current = { totalRegistered: 100, totalAttended: 80, insights: [], evalRows: [], activityRows: [], topBarangays: [], feedbackAnalysis: analysis() } as unknown as ReportData
  assert.doesNotThrow(() => buildAdvancedInsights(current, null))
  assert.ok(buildAdvancedInsights(current, null).every(value => !value.includes('compared with the previous month')))
  const previous = { ...current, totalAttended: 50 }
  assert.ok(buildAdvancedInsights(current, previous).some(value => value.includes('improved by 30 percentage points')))
  assert.ok(buildAdvancedInsights(current, { ...previous, totalRegistered: 0 }).every(value => !value.includes('compared with the previous month')))
})

function analysis(overrides: Partial<ReportData['feedbackAnalysis']> = {}): ReportData['feedbackAnalysis'] {
  return {
    comments: [], analyzedComments: 0, semanticAssistedComments: 0, modelStatus: 'not-needed',
    sentimentCounts: { positive: 0, negative: 0, mixed: 0, 'no-signal': 0 }, themeCounts: [],
    ...overrides,
  }
}

test('does not generate NLP conclusions without written comments', () => {
  assert.deepEqual(buildFeedbackInsights(analysis()), [])
})

test('shows a single uncertain comment and asks for review without implying a trend', () => {
  const insights = buildFeedbackInsights(analysis({
    analyzedComments: 1,
    sentimentCounts: { positive: 0, negative: 0, mixed: 0, 'no-signal': 1 },
  })).join(' ')
  assert.match(insights, /NLP analyzed 1 written comment/)
  assert.match(insights, /1 comment needs manual review/)
  assert.match(insights, /not an overall participant trend/)
  assert.doesNotMatch(insights, /NLP flagged/)
})

test('ties follow-ups to the concerning topic, not the most frequent positive topic', () => {
  const insights = buildFeedbackInsights(analysis({
    analyzedComments: 10,
    sentimentCounts: { positive: 8, negative: 2, mixed: 0, 'no-signal': 0 },
    themeCounts: [
      { theme: 'food', count: 8, sentimentCounts: { positive: 8, negative: 0, mixed: 0, 'no-signal': 0 } },
      { theme: 'venue', count: 2, sentimentCounts: { positive: 0, negative: 2, mixed: 0, 'no-signal': 0 } },
    ],
  })).join(' ')
  assert.match(insights, /2 comments with negative or mixed signals about venue/)
  assert.match(insights, /Review venue comfort/)
  assert.doesNotMatch(insights, /Review food/)
  assert.doesNotMatch(insights, /Fewer than 3/)
})

test('a detected topic without sentiment does not trigger a complaint recommendation', () => {
  const insights = buildFeedbackInsights(analysis({
    analyzedComments: 1,
    sentimentCounts: { positive: 0, negative: 0, mixed: 0, 'no-signal': 1 },
    themeCounts: [{ theme: 'schedule', count: 1, sentimentCounts: { positive: 0, negative: 0, mixed: 0, 'no-signal': 1 } }],
  })).join(' ')
  assert.doesNotMatch(insights, /Review the schedule/)
})
