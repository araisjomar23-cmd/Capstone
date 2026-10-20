import { readFile } from 'node:fs/promises'
import { analyzeFeedback, type SuggestedSentiment } from '../src/features/evaluations/feedbackAnalyzer.ts'

const labels: SuggestedSentiment[] = ['positive', 'negative', 'mixed', 'no-signal']
const splits = ['dev', 'test'] as const
const sources = ['synthetic', 'real'] as const
const csvUrl = new URL('../tests/data/feedback_labels.csv', import.meta.url)

function parseCsv(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((value) => value.length > 0)) rows.push(row)
  }
  return rows
}

const csv = await readFile(csvUrl, 'utf8')
const [header, ...records] = parseCsv(csv.replace(/^\uFEFF/, ''))
if (header?.join(',') !== 'comment,language,label,split,source,known_limitation') {
  throw new Error('Expected CSV columns in this order: comment,language,label,split,source,known_limitation')
}

const samples = records.map((record, index) => {
  const [comment, language, label, split, source, knownLimitation] = record
  if (!comment || !language || !labels.includes(label as SuggestedSentiment)
    || !splits.includes(split as typeof splits[number])
    || !sources.includes(source as typeof sources[number])) {
    throw new Error(`Invalid sample at CSV data row ${index + 1}: expected comment, language, supported label, dev/test split, and synthetic/real source.`)
  }
  return { comment, language, expected: label as SuggestedSentiment, split: split as typeof splits[number], source: source as typeof sources[number], knownLimitation }
})

if (samples.length === 0) throw new Error('The feedback label CSV contains no sample rows.')

const results = samples.map((sample) => ({ ...sample, analysis: analyzeFeedback(sample.comment) }))
console.log(`Samples: ${results.length}`)
for (const source of sources) {
  const count = results.filter((result) => result.source === source).length
  console.log(`${source[0].toUpperCase()}${source.slice(1)} rows: ${count}`)
}

function printAccuracy(split: typeof splits[number]) {
  const splitResults = results.filter((result) => result.split === split)
  const correctCount = splitResults.filter((result) => result.expected === result.analysis.label).length
  const accuracy = splitResults.length ? `${((correctCount / splitResults.length) * 100).toFixed(1)}%` : 'N/A'
  console.log(`${split === 'dev' ? 'Dev' : 'Test'} accuracy: ${correctCount}/${splitResults.length} (${accuracy})`)
}

printAccuracy('dev')
printAccuracy('test')

const devResults = results.filter((result) => result.split === 'dev')
console.log('\nDev per-label metrics:')

for (const label of labels) {
  const truePositive = devResults.filter((result) => result.expected === label && result.analysis.label === label).length
  const falsePositive = devResults.filter((result) => result.expected !== label && result.analysis.label === label).length
  const falseNegative = devResults.filter((result) => result.expected === label && result.analysis.label !== label).length
  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0
  const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0
  const actualCount = devResults.filter((result) => result.expected === label).length
  console.log(`  ${label}: precision ${(precision * 100).toFixed(1)}% (${truePositive}/${truePositive + falsePositive || 0}), recall ${(recall * 100).toFixed(1)}% (${truePositive}/${actualCount})`)
}

const misclassified = devResults.filter((result) => result.expected !== result.analysis.label)
console.log(`\nMisclassified dev comments: ${misclassified.length}`)
if (misclassified.length === 0) {
  console.log('  None')
} else {
  for (const result of misclassified) {
    const matchedTerms = result.analysis.matchedTerms.length
      ? result.analysis.matchedTerms.map((term) => `${term.term}→${term.sentiment}${term.negated ? ' (negated)' : ''} [${term.weight}]`).join(', ')
      : '(none)'
    console.log(`  [${result.language}] expected=${result.expected}, predicted=${result.analysis.label}, score=${result.analysis.score}`)
    console.log(`    comment: ${JSON.stringify(result.comment)}`)
    console.log(`    matched terms: ${matchedTerms}`)
    if (result.knownLimitation) console.log(`    ${result.knownLimitation}`)
  }
}
