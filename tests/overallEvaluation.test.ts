import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeFeedback, analyzeFeedbackHybrid, type TextEmbedder } from '../src/features/evaluations/feedbackAnalyzer.ts'
import { analyzeOverallEvaluation, evaluationRecommendation } from '../src/features/evaluations/evaluationAnalysis.ts'

const responses = {
  fb_valuable: 'Knowledge and skills gained', fb_improve: 'Time management', fb_learning: 'Practical skills',
  fb_attend_again: 'Probably not', fb_participation: 'Active participant in all sessions',
  fb_time_mgmt: 'Excellent — ran on schedule', q1: '3', q2: '3', q3: '3', q4: '3', overall_star: '3',
}
const evaluation = { rating: 3, responses, feedback: 'I want more pogi participants', wouldRecommend: false }

test('full evaluation uses the recorded context while preserving Neutral comment sentiment independently', () => {
  const comment = analyzeFeedback(evaluation.feedback)
  const beforeComment = structuredClone(comment), beforeEvaluation = structuredClone(evaluation)
  const result = analyzeOverallEvaluation(evaluation, comment)
  assert.equal(result.rating, 3)
  assert.equal(result.ratingLabel, 'Neutral Overall Rating')
  assert.equal(result.commentSentiment, 'neutral')
  assert.equal(comment.context?.relevance, 'low')
  assert.equal(comment.context?.actionability, 'not-directly-actionable')
  assert.deepEqual(result.criteria.map(item => item.rating), [3, 3, 3, 3])
  assert.equal(result.recordedAnswers, 10)
  assert.equal(result.recommendation.label, 'Neutral recommendation (3/5)')
  assert.deepEqual(result.reviewFlags.map(flag => flag.id), ['time-management-context', 'future-participation'])
  const narrative = result.narrative.join(' ')
  for (const fact of ['Knowledge and skills gained', 'Practical skills', 'All four assessment criteria were rated Neutral (3/5)', 'Time management', 'Excellent — ran on schedule', 'Probably not', 'self-reported', 'further review rather than a definite conclusion about dissatisfaction']) assert.ok(narrative.includes(fact), fact)
  assert.match(result.reviewFlags[0].detail, /not necessarily contradictory/)
  assert.match(result.reviewFlags[0].detail, /how time is allocated/)
  assert.match(result.reviewFlags[1].detail, /does not establish their reason or prove dissatisfaction/)
  assert.match(result.commentContextNote!, /not evidence that this preference caused/)
  assert.deepEqual(comment, beforeComment)
  assert.deepEqual(evaluation, beforeEvaluation)
})

test('ratings and return intention cannot overwrite positive, negative or neutral written-comment sentiment', () => {
  for (const [feedback, label] of [['Nindot ang venue.', 'positive'], ['Dili nindot ang venue.', 'negative'], ['I want more pogi participants', 'neutral']] as const) {
    const comment = analyzeFeedback(feedback)
    for (const rating of [1, 3, 5]) {
      const result = analyzeOverallEvaluation({ ...evaluation, feedback, rating, responses: { ...responses, overall_star: String(rating) } }, comment)
      assert.equal(result.commentSentiment, label)
      assert.equal(comment.label, label)
      assert.equal(result.rating, rating)
    }
  }
})

test('legacy or partial answers do not invent benefits, engagement, criteria or return intentions', () => {
  const result = analyzeOverallEvaluation({ rating: 4, feedback: '', responses: {} })
  assert.equal(result.rating, 4)
  assert.equal(result.commentSentiment, null)
  assert.equal(result.recordedAnswers, 0)
  assert.ok(result.answers.every(answer => answer.answer === null))
  assert.ok(result.criteria.every(criterion => criterion.rating === null))
  assert.deepEqual(result.reviewFlags, [])
  assert.match(result.narrative.join(' '), /No missing benefits, ratings or intentions have been inferred/)
  const malformed = analyzeOverallEvaluation({ rating: 0, responses: ['3'] })
  assert.equal(malformed.rating, null)
  assert.equal(malformed.ratingSource, 'missing')
  const fallback = analyzeOverallEvaluation({ responses: { overall_star: '3', q1: 'NaN', q2: '7' } })
  assert.equal(fallback.rating, 3)
  assert.equal(fallback.ratingSource, 'overall_star')
  assert.ok(fallback.criteria.every(criterion => criterion.rating === null))
})

test('improvement priority is not automatically a contradiction or an invalid submission', () => {
  const consistent = analyzeOverallEvaluation({ ...evaluation, responses: { ...responses, fb_time_mgmt: 'Poor — significant delays', fb_attend_again: 'Definitely yes' } })
  assert.ok(!consistent.reviewFlags.some(flag => flag.id === 'time-management-context'))
  assert.ok(!consistent.reviewFlags.some(flag => flag.id === 'future-participation'))
  const otherArea = analyzeOverallEvaluation({ ...evaluation, responses: { ...responses, fb_improve: 'Food and refreshments', fb_attend_again: 'Probably yes' } })
  assert.deepEqual(otherArea.reviewFlags, [])
  const high = analyzeOverallEvaluation({ ...evaluation, rating: 5, responses: { ...responses, overall_star: '5' } })
  assert.equal(high.ratingLabel, 'High Overall Rating')
  assert.ok(high.reviewFlags.some(flag => flag.id === 'future-participation'))
  assert.equal(high.rating, 5)
  assert.doesNotMatch(high.narrative.join(' '), /because.*pogi|invalid|definitely dissatisfied/)
})

test('stored and form ratings remain intact when they differ', () => {
  const result = analyzeOverallEvaluation({ ...evaluation, rating: 4 })
  assert.equal(result.rating, 4)
  assert.equal(result.ratingSource, 'rating')
  assert.ok(result.reviewFlags.some(flag => flag.id === 'rating-fields'))
})

test('recommendation and future attendance are distinct, with neutral and missing recommendations kept explicit', () => {
  assert.equal(evaluationRecommendation(evaluation).tone, 'neutral')
  assert.equal(evaluationRecommendation({ responses: { q4: '5' }, wouldRecommend: false }).tone, 'positive')
  assert.equal(evaluationRecommendation({ responses: { q4: '2' }, wouldRecommend: true }).tone, 'negative')
  assert.equal(evaluationRecommendation({ wouldRecommend: false }).tone, 'unknown')
  assert.equal(evaluationRecommendation({ wouldRecommend: true }).tone, 'positive')
})

test('overall interpretation remains available with the complete model fallback', async () => {
  const offline: TextEmbedder = async () => { throw new Error('offline') }
  const batch = await analyzeFeedbackHybrid([evaluation.feedback], { embedder: offline })
  assert.equal(batch.modelStatus, 'unavailable')
  const result = analyzeOverallEvaluation(evaluation, batch.analyses[0])
  assert.equal(result.commentSentiment, 'neutral')
  assert.equal(result.rating, 3)
  assert.equal(result.reviewFlags.length, 2)
})
