import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeFeedback } from '../src/features/evaluations/feedbackAnalyzer.ts'

test('recognizes the Bisaya phrase “wala koy reklamo” as positive', () => {
  const result = analyzeFeedback('wala koy reklamo')
  assert.equal(result.label, 'positive')
  assert.ok(result.matchedTerms.some((term) => term.term === 'wala koy reklamo'))
})

test('keeps opposing sentiment as mixed in “kapoy pero lingaw”', () => {
  const result = analyzeFeedback('kapoy pero lingaw')
  assert.equal(result.label, 'mixed')
  assert.ok(result.matchedTerms.some((term) => term.term === 'kapoy' && term.sentiment === 'negative'))
  assert.ok(result.matchedTerms.some((term) => term.term === 'lingaw' && term.sentiment === 'positive'))
})

test('negates a positive Bisaya term within the configured window', () => {
  const result = analyzeFeedback('dili ko ganahan sa venue')
  assert.equal(result.label, 'negative')
  assert.equal(result.matchedTerms[0]?.negated, true)
  assert.ok(result.themes.some((theme) => theme.theme === 'venue'))
})

test('handles English negation and double negation polarity', () => {
  assert.equal(analyzeFeedback('not good').label, 'negative')
  assert.equal(analyzeFeedback('not bad').label, 'positive')
})

test('does not treat negation exceptions as negators', () => {
  const result = analyzeFeedback('not only good but very helpful')
  assert.equal(result.label, 'positive')
  assert.ok(result.matchedTerms.every((term) => !term.negated))
})

test('ends negation scope at a comma', () => {
  const result = analyzeFeedback('not good, helpful')
  assert.equal(result.matchedTerms.find((term) => term.term === 'good')?.sentiment, 'negative')
  assert.equal(result.matchedTerms.find((term) => term.term === 'good')?.negated, true)
  assert.equal(result.matchedTerms.find((term) => term.term === 'helpful')?.sentiment, 'positive')
  assert.equal(result.matchedTerms.find((term) => term.term === 'helpful')?.negated, false)
})

test('ends negation scope at contrast words and exception phrases', () => {
  const result = analyzeFeedback('not good but helpful')
  assert.equal(result.matchedTerms.find((term) => term.term === 'good')?.negated, true)
  assert.equal(result.matchedTerms.find((term) => term.term === 'helpful')?.negated, false)
  assert.equal(analyzeFeedback('not only good').label, 'positive')
})

test('skips Bisaya pronouns and particles in the negation window', () => {
  const result = analyzeFeedback('wala nako kasabot')
  assert.equal(result.label, 'negative')
  assert.equal(result.matchedTerms.find((term) => term.term === 'kasabot')?.negated, true)
})

test('boosts sentiment after contrast and keeps low-weight words weak', () => {
  const result = analyzeFeedback('kapoy pero lingaw gyud')
  assert.equal(result.label, 'positive')
  assert.equal(result.matchedTerms.find((term) => term.term === 'lingaw')?.weight, 2.03)
  assert.equal(result.matchedTerms.find((term) => term.term === 'kapoy')?.weight, 0.3)
  for (const word of ['hinay', 'dugay', 'mainit', 'gamay']) {
    const term = analyzeFeedback(word).matchedTerms[0]
    assert.equal(term?.weight, 0.3, word)
    assert.equal(term?.ambiguous, true, word)
  }
})

test('recognizes added mixed-language vocabulary and requested phrases', () => {
  for (const text of ['klaro', 'salamat', 'ganda', 'maganda', 'natutunan', 'natun-an', 'nakat-unan', 'katun-an', 'ayos', 'engaging', 'informative', 'helpful', 'walang masabi']) {
    assert.equal(analyzeFeedback(text).label, 'positive', text)
  }
  for (const text of ['boring', 'not enough', 'too hot', 'too long', 'too short', 'too early']) {
    assert.equal(analyzeFeedback(text).label, 'negative', text)
  }
})

test('keeps Tagalog bait positive and Bisaya bati negative', () => {
  assert.equal(analyzeFeedback('bait').label, 'positive')
  assert.equal(analyzeFeedback('bati').label, 'negative')
})

test('normalizes stretched spellings, spelling variants, and intensifiers', () => {
  const result = analyzeFeedback('nindottt kaayo')
  assert.equal(result.label, 'positive')
  assert.equal(result.matchedTerms[0]?.term, 'nindot')
  assert.ok((result.matchedTerms[0]?.weight || 0) > 1.3)
})

test('returns no-signal for text without lexicon sentiment', () => {
  const result = analyzeFeedback('the workshop was on Tuesday')
  assert.equal(result.label, 'no-signal')
  assert.equal(result.score, 0)
  assert.deepEqual(result.matchedTerms, [])
})

test('returns no-signal for empty text', () => {
  assert.deepEqual(analyzeFeedback('   '), {
    label: 'no-signal',
    score: 0,
    matchedTerms: [],
    themes: [],
  })
})
