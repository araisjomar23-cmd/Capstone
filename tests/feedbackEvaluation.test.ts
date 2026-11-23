import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSeparateFeedbackSets, feedbackMetrics, parseFeedbackCsv, readFeedbackDataset, type FeedbackSample } from '../scripts/feedbackEvaluation.ts'
import { analyzeFeedback } from '../src/features/evaluations/feedbackAnalyzer.ts'

test('CSV supports quoted commas, escaped quotes, multiline text, BOM and CRLF', () => {
  assert.deepEqual(parseFeedbackCsv('\uFEFFa,b\r\n"hello, ""world""","line\n2"\r\n'), [['a', 'b'], ['hello, "world"', 'line\n2']])
  assert.throws(() => parseFeedbackCsv('a\n"unclosed'))
})

test('empty real template yields no accuracy, and synthetic schema cannot be claimed real', async () => {
  const template = fileURLToPath(new URL('../src/public/data/nlp/cydo_real_feedback_labeling_template.csv', import.meta.url))
  // A filled-in template is also valid; no test assumes real data will remain absent forever.
  const rows = await readFeedbackDataset(template, 'real')
  if (!rows.length) assert.equal(feedbackMetrics(rows, []).accuracy, null)
  await assert.rejects(readFeedbackDataset(fileURLToPath(new URL('../src/public/data/nlp/bisaya_feedback_seed.csv', import.meta.url)), 'real'))
})

test('manual schema requires sentiment, valid topics and separate suggestion labels', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cydo-nlp-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'labels.csv')
  const header = 'comment_id,comment_text,reviewer_sentiment,reviewer_topic,reviewer_is_suggestion,review_notes\n'
  await writeFile(path, header + 'anon-1,"Good venue, bad food",Mixed,venue;food,false,\n')
  const samples = await readFeedbackDataset(path, 'real')
  assert.deepEqual(samples[0].topics, ['venue', 'food'])
  assert.equal(samples[0].sentiment, 'mixed')
  await writeFile(path, header + 'anon-1,please,Needs review,unknown,,\n')
  await assert.rejects(readFeedbackDataset(path, 'real'))
  await writeFile(path, header + 'anon-1,Personal preference,Neutral,participants,false,\nanon-2,Unclear words,Uncertain,,false,\n')
  assert.deepEqual((await readFeedbackDataset(path, 'real')).map(sample => sample.sentiment), ['neutral', 'no-signal'])
})

test('confusion, per-class F1, multi-label topic and suggestion metrics are independently counted', () => {
  const samples: FeedbackSample[] = [
    { id: '1', text: 'Good venue', sentiment: 'positive', topics: ['venue'], isSuggestion: false, source: 'real', split: 'heldout' },
    { id: '2', text: 'bad food', sentiment: 'negative', topics: ['food', 'schedule'], isSuggestion: true, source: 'real', split: 'heldout' },
    { id: '3', text: 'unknown', sentiment: 'negative', topics: [], isSuggestion: false, source: 'real', split: 'heldout' },
  ]
  const metrics = feedbackMetrics(samples, samples.map(sample => analyzeFeedback(sample.text)))
  assert.equal(metrics.correct, 2)
  assert.deepEqual(metrics.confusionMatrix, [[1, 0, 0, 0, 0], [0, 1, 0, 1, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]])
  const negative = metrics.perClass.find(row => row.label === 'negative')!
  assert.equal(negative.precision, 1)
  assert.equal(negative.recall, 0.5)
  assert.equal(negative.f1, 2 / 3)
  assert.equal(metrics.perTopic.find(row => row.topic === 'schedule')!.recall, 0)
  assert.equal(metrics.topicExact, 2 / 3)
  assert.equal(metrics.suggestion.recall, 0)
})

test('calibration rejects normalized duplicates in the held-out or synthetic sets', () => {
  const sample: FeedbackSample = { id: '1', text: 'Good venue!', sentiment: 'positive', topics: ['venue'], isSuggestion: false, source: 'real', split: 'calibration' }
  assert.throws(() => assertSeparateFeedbackSets([sample], [{ ...sample, text: 'GOOD venue.' }]))
  assert.doesNotThrow(() => assertSeparateFeedbackSets([sample], [{ ...sample, text: 'Bad venue' }]))
})
