import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeFeedback, analyzeFeedbackHybrid, explainFeedback, FEEDBACK_SEMANTIC_THRESHOLDS, type TextEmbedder } from '../src/features/evaluations/feedbackAnalyzer.ts'
import { buildFeedbackInsights } from '../src/features/reports/feedbackInsights.ts'
import type { ReportData } from '../src/features/reports/reportService.ts'
import references from '../src/features/evaluations/feedbackSemanticReferences.json' with { type: 'json' }

const text = 'I want more pogi participants'
test('actual participant request is Neutral, participant-related and a non-actionable personal preference', () => {
  const result = analyzeFeedback(text)
  assert.equal(result.label, 'neutral')
  assert.deepEqual(result.themes.map(theme => theme.theme), ['participants'])
  assert.equal(result.isSuggestion, false)
  assert.deepEqual(result.context?.intents, ['request', 'personal-preference'])
  assert.equal(result.context?.requestType, 'personal-preference')
  assert.equal(result.context?.relevance, 'low')
  assert.equal(result.context?.actionability, 'not-directly-actionable')
  const explanation = explainFeedback(text, result, 'rules').join(' ')
  for (const phrase of ['“I want more”', '“pogi participants”', 'attractive', 'Neutral', 'quality or effectiveness', 'not directly actionable']) assert.ok(explanation.includes(phrase), phrase)
  for (const evidence of result.context!.evidence) assert.ok(text.includes(evidence.phrase))
  assert.doesNotMatch(explanation, /model detected|confident|probability of/)
  assert.ok(explanation.includes('does not justify appearance-based selection'))
  const analysis: ReportData['feedbackAnalysis'] = { comments: [{ id: 'regression', activityTitle: 'Workshop', submittedAt: '2026-11-23', text, sentiment: result.label, context: result.context, isSuggestion: result.isSuggestion, themes: ['participants'], matchedTerms: result.matchedTerms, themeDetails: result.themes, sentimentSource: 'rules' }], analyzedComments: 1, semanticAssistedComments: 0, modelStatus: 'not-needed', sentimentCounts: { positive: 0, negative: 0, neutral: 1, mixed: 0, 'no-signal': 0 }, themeCounts: [{ theme: 'participants', count: 1, sentimentCounts: { positive: 0, negative: 0, neutral: 1, mixed: 0, 'no-signal': 0 } }] }
  const recommendations = buildFeedbackInsights(analysis).join(' ')
  assert.doesNotMatch(recommendations, /NLP flagged|manual review|appearance|attractive|select.*participants/)
})

test('participant preferences support Tagalog, Cebuano, code-switching and informal spelling', () => {
  for (const comment of ['Gusto ko ng mas pogi na participants.', 'Unta daghan gwapo nga partisipante.', 'Mas ganahan ko og gwapo nga mga partisipante.', 'I want more pogiii participants please.', 'I prefer handsome participants.', 'Please add attractive participants.']) {
    const result = analyzeFeedback(comment)
    assert.equal(result.label, 'neutral', comment)
    assert.equal(result.context?.relevance, 'low', comment)
    assert.equal(result.isSuggestion, false, comment)
    assert.ok(result.themes.some(theme => theme.theme === 'participants'), comment)
  }
})

test('request phrasing does not imply negativity or always mean a personal preference', () => {
  for (const comment of ['I want more food.', 'Gusto ko ng more snacks.', 'Unta dugangan pa ang oras sa workshop.']) {
    const result = analyzeFeedback(comment)
    assert.equal(result.label, 'no-signal', comment)
    assert.equal(result.isSuggestion, true, comment)
    assert.equal(result.context?.actionability, 'actionable', comment)
    assert.equal(result.context?.relevance, 'high', comment)
  }
  const unrelated = analyzeFeedback('I want more moon rocks.')
  assert.equal(unrelated.label, 'no-signal')
  assert.deepEqual(unrelated.themes, [])
  assert.equal(unrelated.context?.relevance, 'uncertain')
  assert.equal(unrelated.context?.actionability, 'needs-manual-review')
  assert.equal(analyzeFeedback('Please add more moon rocks.').isSuggestion, false)
  const preference = analyzeFeedback('I prefer an afternoon schedule.')
  assert.equal(preference.label, 'neutral')
  assert.equal(preference.context?.relevance, 'high')
  assert.equal(preference.context?.actionability, 'actionable')
  const negated = analyzeFeedback('I want no more pogi participants.')
  assert.equal(negated.label, 'no-signal')
  assert.equal(negated.context?.personalPreferenceOnly, false)
})

test('clear praise and complaints survive a separate personal preference', () => {
  const praise = analyzeFeedback('Good venue. I want more pogi participants.')
  assert.equal(praise.label, 'positive')
  assert.equal(praise.isSuggestion, false)
  assert.equal(praise.context?.requestType, 'personal-preference')
  assert.ok(praise.context?.intents.includes('praise'))
  const mixed = analyzeFeedback('Nindot ang venue pero init kaayo. I want more pogi participants.')
  assert.equal(mixed.label, 'mixed')
  assert.equal(mixed.themes.find(theme => theme.theme === 'venue')?.sentiment, 'mixed')
  const ambiguous = analyzeFeedback('I want more pogi participants who can teach advanced programming.')
  assert.equal(ambiguous.context?.personalPreferenceOnly, false, 'unsupported extra meaning must not be explained as purely appearance-related')
  const incidentalProgram = analyzeFeedback('Please add more pogi participants in the training.')
  assert.equal(incidentalProgram.isSuggestion, false)
  assert.notEqual(incidentalProgram.context?.actionability, 'actionable', 'a program mention is not a concrete improvement request')
})

test('neutral personal preference survives adversarial embeddings and complete model failure', async () => {
  const aggressive: TextEmbedder = async texts => ({ tolist: () => texts.map(() => [1, 0]) })
  const offline: TextEmbedder = async () => { throw new Error('offline') }
  for (const embedder of [aggressive, offline]) {
    const result = await analyzeFeedbackHybrid([text], { embedder })
    assert.equal(result.analyses[0].label, 'neutral')
    assert.deepEqual(result.analyses[0].themes.map(theme => theme.theme), ['participants'])
    assert.equal(result.sentimentSources[0], 'rules')
    assert.equal(result.semanticAssistedComments, 0)
  }
  assert.deepEqual(FEEDBACK_SEMANTIC_THRESHOLDS, { sentimentMargin: 0.035, topicSimilarity: 0.82 })
})

test('appearance preferences about speakers never generate facilitator improvement recommendations', () => {
  const result = analyzeFeedback('I want more handsome facilitators.')
  assert.equal(result.label, 'neutral')
  assert.equal(result.context?.actionability, 'not-directly-actionable')
  assert.equal(result.isSuggestion, false)
})

test('semantic similarity cannot invent evaluative sentiment for an unspecified participant request', async () => {
  const positives = new Set(references.sentiments.positive)
  const embedder: TextEmbedder = async texts => ({ tolist: () => texts.map(value => positives.has(value.slice(7)) || value.slice(7) === 'I want more participants.' ? [1, 0] : [0, 1]) })
  const result = await analyzeFeedbackHybrid(['I want more participants.'], { embedder })
  assert.equal(result.analyses[0].label, 'no-signal')
  assert.equal(result.sentimentSources[0], 'none')
  assert.equal(result.analyses[0].context?.actionability, 'needs-manual-review')
})
