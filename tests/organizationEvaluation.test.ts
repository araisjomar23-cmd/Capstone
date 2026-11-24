import assert from 'node:assert/strict'
import test from 'node:test'
import { ASSESSMENT_VERSION, ASSESSMENT_OPTIONS, ASSESSMENT_QUESTIONS, ASSESSMENT_SUGGESTIONS, EDITABLE_FEEDBACK_FORMAT, assessmentAverage, assessmentScore, assessmentValidation, evaluationScore, recommendationStats, selectedAssessmentSuggestions, assessmentFeedback, assessmentSuggestionsInText, toggleAssessmentSuggestion, recordedAssessmentSuggestions } from '../src/features/evaluations/organizationEvaluation.ts'
import { analyzeOverallEvaluation, evaluationRecommendation } from '../src/features/evaluations/evaluationAnalysis.ts'

const responses = { form_version: ASSESSMENT_VERSION, facilitator_name: 'Facilitator Example', ...Object.fromEntries(ASSESSMENT_QUESTIONS.map(question => [question.key, 'Good'])) }

test('organization form retains exactly seven assessment criteria and its five response labels', () => {
  assert.deepEqual(ASSESSMENT_QUESTIONS.map(question => question.number), [7, 8, 9, 10, 11, 12, 13])
  assert.deepEqual(ASSESSMENT_OPTIONS, ['Poor', 'Average', 'Good', 'Very Good', 'Excellent'])
  assert.equal(assessmentValidation(responses, 'Helpful training.'), null)
  for (const invalid of ['', '   ']) {
    assert.ok(assessmentValidation({ ...responses, facilitator_name: invalid }, 'Helpful'))
    assert.ok(assessmentValidation(responses, invalid))
  }
  assert.ok(assessmentValidation(responses, 'a'.repeat(3001)))
})

test('averages use all seven actual ratings without rounding each participant to a star', () => {
  const varied = { ...responses, assessment_content: 'Very Good', assessment_methods: 'Excellent' }
  assert.equal(assessmentAverage(varied), 24 / 7)
  assert.equal(evaluationScore({ rating: 3, responses: varied }), 24 / 7)
  assert.equal(evaluationScore({ rating: 4, responses: {} }), 4)
  assert.equal(evaluationScore({ rating: 3, responses: { ...responses, assessment_speaker: '' } }), null)
  for (const invalid of ['5', 5, 'Neutral', 'strongly agree', 'excellent', {}, null]) assert.equal(assessmentScore(invalid), null)
})

test('Good 3/5 is preserved as an assessment result independently of Neutral comment sentiment', () => {
  const input = { rating: 3, responses, feedback: 'I want more pogi participants', wouldRecommend: true }
  const before = structuredClone(input)
  const result = analyzeOverallEvaluation(input)
  assert.equal(result.ratingScale, 'assessment')
  assert.equal(result.ratingSource, 'assessment_average')
  assert.equal(result.rating, 3)
  assert.equal(result.commentSentiment, 'neutral')
  assert.equal(result.recordedAnswers, 8)
  assert.equal(result.totalAnswers, 8)
  assert.equal(result.criteria.length, 7)
  assert.deepEqual(result.reviewFlags, [])
  assert.match(result.narrative.join(' '), /Good \(3\)/)
  assert.doesNotMatch(result.narrative.join(' '), /rated Neutral|probably not|selected improvement priority/)
  assert.equal(evaluationRecommendation(input).tone, 'unknown')
  assert.match(result.recommendation.label, /not asked/)
  assert.deepEqual(input, before)
})

test('lower assessment ratings raise review prompts without inventing causes or missing answers', () => {
  const result = analyzeOverallEvaluation({ rating: 3, responses: { ...responses, assessment_content: 'Poor', assessment_relevance: 'Average' }, feedback: 'Great facilitator' })
  assert.equal(result.commentSentiment, 'positive')
  assert.deepEqual(result.reviewFlags[0].responseKeys, ['assessment_content', 'assessment_relevance'])
  assert.match(result.reviewFlags[0].detail, /do not establish the cause/)
  const partial = analyzeOverallEvaluation({ rating: 3, responses: { form_version: ASSESSMENT_VERSION, assessment_content: 'Good' } })
  assert.equal(partial.rating, null)
  assert.match(partial.narrative.join(' '), /incomplete \(1\/8 recorded\)/)
})

test('recommendation rates exclude organization responses while preserving historical data', () => {
  assert.deepEqual(recommendationStats([{ responses, wouldRecommend: false }]), { recommendResponses: 0, recommendRate: 0 })
  assert.deepEqual(recommendationStats([{ responses, wouldRecommend: false }, { responses: {}, wouldRecommend: true }]), { recommendResponses: 1, recommendRate: 100 })
  assert.deepEqual(recommendationStats([{ wouldRecommend: true }, { wouldRecommend: false }]), { recommendResponses: 2, recommendRate: 50 })
})

test('multiple optional suggestions and a typed comment are retained independently', () => {
  const selected = { ...responses, selected_suggestions: JSON.stringify(['hands-on', 'questions']) }
  const comment = 'Nindot ang speaker. Salamat!'
  assert.equal(selectedAssessmentSuggestions(selected).length, 2)
  assert.equal(assessmentValidation(selected, ''), null)
  assert.equal(assessmentValidation(selected, comment), null)
  assert.equal(assessmentFeedback(selected, comment), `${ASSESSMENT_SUGGESTIONS[0].text}\n${ASSESSMENT_SUGGESTIONS[3].text}\n\n${comment}`)
  assert.equal(comment, 'Nindot ang speaker. Salamat!')
  assert.equal(assessmentFeedback(responses, comment), comment)
  assert.equal(assessmentFeedback(selected, '').split('\n').length, 2)
  assert.ok(assessmentValidation(selected, 'x'.repeat(3000)))
})

test('malformed, unknown and duplicate suggestion IDs cannot add invented or repeated phrases', () => {
  for (const selected_suggestions of ['invalid', '{}', 'null', '["unknown"]']) {
    assert.deepEqual(selectedAssessmentSuggestions({selected_suggestions}), [])
    assert.equal(assessmentFeedback({selected_suggestions}, 'Own comment'), 'Own comment')
  }
  assert.equal(selectedAssessmentSuggestions({selected_suggestions: '["hands-on","hands-on",null,"unknown"]'}).length, 1)
  assert.equal(assessmentFeedback({}, ''), '')
})

test('suggestions insert into the editable comment and deselection removes only their intact lines', () => {
  const ownText = 'Great trainer.\nPlease keep the practical exercises.'
  const first = toggleAssessmentSuggestion(ownText, 'hands-on')
  const second = toggleAssessmentSuggestion(first.text, 'questions')
  assert.equal(first.error, null)
  assert.ok(second.text.startsWith(ownText))
  assert.equal(assessmentSuggestionsInText(second.text).length, 2)
  assert.equal(second.text.split(ASSESSMENT_SUGGESTIONS[0].text).length - 1, 1)
  const removed = toggleAssessmentSuggestion(second.text, 'hands-on')
  assert.ok(removed.text.startsWith(ownText))
  assert.doesNotMatch(removed.text, /adding more hands-on/)
  assert.deepEqual(assessmentSuggestionsInText(removed.text).map(item => item.id), ['questions'])
  assert.equal(toggleAssessmentSuggestion(ownText, 'unknown').text, ownText)
  const full = 'x'.repeat(3000)
  assert.equal(toggleAssessmentSuggestion(full, 'hands-on').text, full)
  assert.match(toggleAssessmentSuggestion(full, 'hands-on').error!, /shorten/)
})

test('edited or deleted suggestions are never silently restored or duplicated during submission', () => {
  const answers = {...responses, feedback_format: EDITABLE_FEEDBACK_FORMAT, selected_suggestions:'["hands-on","questions"]'}
  const text = 'I suggest adding fewer activities with more practice.\nThe trainer was great!'
  assert.equal(assessmentFeedback(answers, text), text)
  assert.deepEqual(recordedAssessmentSuggestions(answers, text), [])
  assert.equal(assessmentFeedback(answers, ''), '')
  assert.ok(assessmentValidation(answers, '   '))
  const inserted = toggleAssessmentSuggestion(text, 'questions').text
  assert.equal(assessmentFeedback(answers, inserted), inserted.trim())
  assert.equal(assessmentFeedback(answers, inserted).split(ASSESSMENT_SUGGESTIONS[3].text).length - 1, 1)
  assert.deepEqual(recordedAssessmentSuggestions(answers, inserted).map(item => item.id), ['questions'])
  assert.deepEqual(recordedAssessmentSuggestions(null, inserted), [])
})
