import { readFile } from 'node:fs/promises'
import type { FeedbackAnalysis, SuggestedSentiment } from '../src/features/evaluations/feedbackAnalyzer.ts'

export const SENTIMENTS: SuggestedSentiment[] = ['positive', 'negative', 'mixed', 'no-signal', 'neutral']
export const TOPICS = ['venue', 'schedule', 'food', 'facilitators', 'content', 'participants']
export interface FeedbackSample {
  id: string; text: string; sentiment: SuggestedSentiment; topics: string[] | null
  isSuggestion: boolean | null; source: 'synthetic' | 'real'; split: string
}

export function parseFeedbackCsv(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  const text = source.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else if (quoted || !field.length) quoted = !quoted
      else throw new Error('Malformed CSV quote')
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(field); field = ''
      if (c !== ',') {
        if (row.some(value => value.trim())) rows.push(row)
        row = []
        if (c === '\r' && text[i + 1] === '\n') i++
      }
    } else field += c
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  if (field.length || row.length) { row.push(field); if (row.some(value => value.trim())) rows.push(row) }
  return rows
}

export async function readFeedbackDataset(path: string, kind: 'synthetic' | 'real', split = 'heldout'): Promise<FeedbackSample[]> {
  const [header, ...rows] = parseFeedbackCsv(await readFile(path, 'utf8'))
  const schema = header?.join(',')
  const seed = schema === 'text,sentiment,topic,is_suggestion,language,source'
  const real = schema === 'comment_id,comment_text,reviewer_sentiment,reviewer_topic,reviewer_is_suggestion,review_notes'
  const legacy = schema === 'comment,language,label,split,source,known_limitation'
  if (!(seed || real || legacy) || (kind === 'real' && !real)) throw new Error('Unsupported dataset schema or missing manual-review columns')
  return rows.map((row, index) => {
    if (row.length !== header.length) throw new Error(`Wrong column count at data row ${index + 1}`)
    const text = row[real ? 1 : 0].trim()
    const label = row[real || legacy ? 2 : 1].trim().toLowerCase()
    const sentiment = ['needs review', 'uncertain', 'no-signal'].includes(label) ? 'no-signal' : label as SuggestedSentiment
    const source = real ? 'real' : legacy ? row[4] : row[5].startsWith('synthetic') ? 'synthetic' : row[5]
    if (!text || !SENTIMENTS.includes(sentiment) || source !== kind) throw new Error(`Invalid text, label, or provenance at data row ${index + 1}`)
    const topics = legacy ? null : row[real ? 3 : 2].toLowerCase().split(/[;|]/).map(value => value.trim()).filter(Boolean)
    if (topics?.some(topic => !TOPICS.includes(topic)) || new Set(topics ?? []).size !== (topics?.length ?? 0)) throw new Error(`Invalid or duplicate topics at data row ${index + 1}`)
    const suggestion = legacy ? null : row[real ? 4 : 3].trim().toLowerCase()
    if (suggestion !== null && suggestion !== 'true' && suggestion !== 'false') throw new Error(`Missing suggestion label at data row ${index + 1}`)
    return { id: real ? row[0].trim() || `row-${index + 1}` : `row-${index + 1}`, text, sentiment, topics, isSuggestion: suggestion === null ? null : suggestion === 'true', source: kind, split: legacy ? row[3] : seed ? 'dev' : split }
  })
}

export function binaryMetrics(tp: number, fp: number, fn: number) {
  const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0
  return { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, support: tp + fn, predicted: tp + fp }
}

export function feedbackMetrics(samples: FeedbackSample[], predictions: FeedbackAnalysis[]) {
  if (samples.length !== predictions.length) throw new Error('Prediction count does not match dataset')
  const confusionMatrix = SENTIMENTS.map(actual => SENTIMENTS.map(predicted => samples.filter((sample, i) => sample.sentiment === actual && predictions[i].label === predicted).length))
  const perClass = SENTIMENTS.map((label, index) => {
    const tp = confusionMatrix[index][index]
    return { label, ...binaryMetrics(tp, confusionMatrix.reduce((sum, row) => sum + row[index], 0) - tp, confusionMatrix[index].reduce((a, b) => a + b, 0) - tp) }
  })
  const perTopic = TOPICS.map(topic => {
    let tp = 0, fp = 0, fn = 0, labeled = 0
    samples.forEach((sample, i) => {
      if (sample.topics === null) return
      labeled++
      const actual = sample.topics.includes(topic), predicted = predictions[i].themes.some(item => item.theme === topic)
      if (actual && predicted) tp++
      if (!actual && predicted) fp++
      if (actual && !predicted) fn++
    })
    return { topic, labeled, ...binaryMetrics(tp, fp, fn) }
  })
  const topicRows = samples.filter(sample => sample.topics !== null).length
  const topicExact = samples.filter((sample, i) => sample.topics !== null && sample.topics.length === predictions[i].themes.length && sample.topics.every(topic => predictions[i].themes.some(item => item.theme === topic))).length
  let tp = 0, fp = 0, fn = 0
  samples.forEach((sample, i) => {
    if (sample.isSuggestion === null) return
    const predicted = Boolean(predictions[i].isSuggestion)
    if (sample.isSuggestion && predicted) tp++
    if (!sample.isSuggestion && predicted) fp++
    if (sample.isSuggestion && !predicted) fn++
  })
  const correct = samples.filter((sample, i) => sample.sentiment === predictions[i].label).length
  return {
    count: samples.length, correct, accuracy: samples.length ? correct / samples.length : null,
    confusionMatrix, perClass, macroF1: perClass.reduce((sum, row) => sum + row.f1, 0) / SENTIMENTS.length,
    perTopic, topicExact: topicRows ? topicExact / topicRows : null,
    topicMacroF1: perTopic.reduce((sum, row) => sum + row.f1, 0) / TOPICS.length,
    suggestion: { labeled: samples.filter(sample => sample.isSuggestion !== null).length, ...binaryMetrics(tp, fp, fn) },
  }
}

export function assertSeparateFeedbackSets(calibration: FeedbackSample[], heldout: FeedbackSample[]) {
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const used = new Set(calibration.map(sample => normalize(sample.text)))
  if (heldout.some(sample => used.has(normalize(sample.text)))) throw new Error('Datasets overlap. Use independent comments; no held-out metrics were reported.')
}
