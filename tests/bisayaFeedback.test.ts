import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeFeedback, analyzeFeedbackHybrid, type TextEmbedder } from '../src/features/evaluations/feedbackAnalyzer.ts'
import references from '../src/features/evaluations/feedbackSemanticReferences.json' with { type: 'json' }
import { readFeedbackDataset } from '../scripts/feedbackEvaluation.ts'

const seed = await readFeedbackDataset(fileURLToPath(new URL('../src/public/data/nlp/bisaya_feedback_seed.csv', import.meta.url)), 'synthetic')
for (const [index, sample] of seed.entries()) {
  test(`synthetic development regression ${index + 1}: sentiment, topics and suggestion`, () => {
    const result = analyzeFeedback(sample.text)
    assert.equal(result.label, sample.sentiment, sample.text)
    assert.equal(Boolean(result.isSuggestion), sample.isSuggestion, sample.text)
    assert.deepEqual(result.themes.map(theme => theme.theme).sort(), [...sample.topics!].sort(), sample.text)
  })
}

test('requested negation, informal variants, and whole-token boundaries', () => {
  for (const text of ['Dili nindot ang programa.', 'Walay klaro ang discussion.', "Wala'y klaro ang discussion.", 'Wala’y klaro ang discussion.']) assert.equal(analyzeFeedback(text).label, 'negative', text)
  assert.equal(analyzeFeedback('Dili bati ang programa.').label, 'positive')
  for (const variant of ['kaayo', 'kayo', 'gyud', 'jud', 'dyud']) assert.equal(analyzeFeedback(`Nindottt ${variant} ang programa.`).label, 'positive')
  const clarity = analyzeFeedback('Walay klaro ang discussion.')
  assert.deepEqual(clarity.themes.map(theme => [theme.theme, theme.sentiment]), [['content', 'negative']])
  assert.equal(clarity.matchedTerms.length, 1, 'longest phrase prevents counting klaro twice')
  assert.deepEqual(analyzeFeedback('badminton foodie scheduling').themes, [])
  assert.equal(analyzeFeedback('badminton foodie scheduling').label, 'no-signal')
})

test('contrast preserves mixed sentiment in the same aspect and across aspects', () => {
  for (const [text, topic] of [['Lami ang snacks pero kulang.', 'food'], ['Nindot ang venue pero init kaayo.', 'venue']]) {
    const result = analyzeFeedback(text)
    assert.equal(result.label, 'mixed')
    assert.equal(result.themes.find(theme => theme.theme === topic)?.sentiment, 'mixed')
  }
  const result = analyzeFeedback('Good food but bad venue.')
  assert.equal(result.label, 'mixed')
  assert.equal(result.themes.find(theme => theme.theme === 'food')?.sentiment, 'positive')
  assert.equal(result.themes.find(theme => theme.theme === 'venue')?.sentiment, 'negative')
  assert.equal(analyzeFeedback('Lami ang snacks. Kulang.').themes.find(theme => theme.theme === 'food')?.sentiment, 'positive', 'no topic inheritance across sentences')
  assert.equal(analyzeFeedback('Nindot kaayo gyud ang venue pero hugaw.').label, 'mixed', 'strong praise must not erase a clear complaint')
})

test('suggestions are independent of sentiment, including a separately asserted reason', () => {
  const request = analyzeFeedback('Unta dugangan pa ang oras sa workshop.')
  assert.equal(request.isSuggestion, true)
  assert.equal(request.label, 'no-signal')
  assert.ok(request.themes.some(theme => theme.theme === 'schedule'))
  assert.equal(analyzeFeedback('Please improve the food.').label, 'no-signal')
  assert.equal(analyzeFeedback('Nindot ang venue. Unta dugangan ang lingkoranan.').label, 'positive')
  assert.equal(analyzeFeedback('Nindot ang venue unta dugangan ang lingkoranan.').label, 'positive')
  const complaint = analyzeFeedback('Unta dugangan ang snacks kay kulang.')
  assert.equal(complaint.isSuggestion, true)
  assert.equal(complaint.label, 'negative')
  assert.equal(complaint.themes.find(theme => theme.theme === 'food')?.sentiment, 'negative')
})

// Deterministic semantic vectors exercise the actual hybrid path without downloading weights.
// They test routing and safeguards, not pretrained E5 accuracy.
const positive = new Set(references.sentiments.positive)
const negative = new Set(references.sentiments.negative)
const mixed = new Set(references.sentiments.mixed)
const neutral = new Set(references.sentiments.neutral)
const fakeEmbedder: TextEmbedder = async (texts, options) => {
  assert.deepEqual(options, { pooling: 'mean', normalize: true })
  return { tolist: () => texts.map(text => {
    assert.ok(text.startsWith('query: '), 'both references and comments use query prefixes')
    const raw = text.slice(7)
    if (positive.has(raw)) return [1, 0, 0, 0, 0]
    if (negative.has(raw)) return [0, 1, 0, 0, 0]
    if (mixed.has(raw)) return [0, 0, 1, 0, 0]
    if (neutral.has(raw)) return [0, 0, 0, 1, 0]
    // Make unknown comments resemble positive references. Existing rules must survive.
    return [1, 0, 0, 0, 0]
  }) }
}

test('hybrid preserves clear rule sentiment, suggestion neutrality and off-topic abstention', async () => {
  const comments = ['Dili nindot ang programa.', 'Lami ang snacks pero kulang.', 'Unta dugangan pa ang oras sa workshop.', 'I want more pogi participants.', 'A singular experience at the event.']
  const result = await analyzeFeedbackHybrid(comments, { embedder: fakeEmbedder })
  assert.equal(result.modelStatus, 'ready')
  assert.deepEqual(result.analyses.map(item => item.label), ['negative', 'mixed', 'no-signal', 'neutral', 'positive'])
  assert.deepEqual(result.analyses[3].themes.map(theme => theme.theme), ['participants'])
  assert.deepEqual(result.sentimentSources, ['rules', 'rules', 'none', 'rules', 'semantic'])
  assert.equal(result.analyses[1].themes.find(theme => theme.theme === 'food')?.sentiment, 'mixed')
})

test('hybrid uses the topic threshold and leaves newly inferred aspect polarity uncertain', async () => {
  const venueRefs = new Set(references.themes.venue)
  const embedder: TextEmbedder = async texts => ({ tolist: () => texts.map(text => venueRefs.has(text.slice(7)) || text.slice(7) === 'A singular experience at the event.' ? [1, 0] : [0, 1]) })
  const result = await analyzeFeedbackHybrid(['A singular experience at the event.'], { embedder })
  assert.deepEqual(result.analyses[0].themes.map(theme => [theme.theme, theme.sentiment]), [['venue', 'no-signal']])
  const below: TextEmbedder = async texts => ({ tolist: () => texts.map(text => text.slice(7) === 'A singular experience at the event.' ? [0.7, 0.7141428429, 0] : venueRefs.has(text.slice(7)) ? [1, 0, 0] : [0, 0, 1]) })
  assert.deepEqual((await analyzeFeedbackHybrid(['A singular experience at the event.'], { embedder: below })).analyses[0].themes, [])
})

test('missing model and malformed embeddings preserve the complete rules-only output', async () => {
  const comments = ['Walay klaro ang discussion.', 'Lami ang snacks pero kulang.', 'Please improve the food.']
  const failures: TextEmbedder[] = [
    async () => { throw new Error('offline') },
    async texts => ({ tolist: () => texts.map(() => [NaN, 0]) }),
    async texts => ({ tolist: () => texts.map(() => [0, 0]) }),
    async texts => ({ tolist: () => texts.map(text => text.slice(7) === comments[1] ? [1, 0] : [1, 0, 0, 0, 0]) }),
  ]
  for (const embedder of failures) {
    const result = await analyzeFeedbackHybrid(comments, { embedder })
    assert.equal(result.modelStatus, 'unavailable')
    assert.deepEqual(result.analyses, comments.map(analyzeFeedback))
    assert.deepEqual(result.sentimentSources, ['rules', 'rules', 'none'])
  }
  const empty = await analyzeFeedbackHybrid([], { embedder: failures[0] })
  assert.equal(empty.modelStatus, 'not-needed')
})
