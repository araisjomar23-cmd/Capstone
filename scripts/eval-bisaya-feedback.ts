import { resolve } from 'node:path'
import {
  analyzeFeedback, analyzeFeedbackHybrid, FEEDBACK_SEMANTIC_THRESHOLDS, getFeedbackTextEmbedder,
  type FeedbackSemanticThresholds, type TextEmbedder,
} from '../src/features/evaluations/feedbackAnalyzer.ts'
import { assertSeparateFeedbackSets, feedbackMetrics, readFeedbackDataset, SENTIMENTS, TOPICS, type FeedbackSample } from './feedbackEvaluation.ts'

const flags = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1]
  if (!['--real', '--calibration', '--heldout', '--mode', '--margins', '--topics'].includes(key) || !value || value.startsWith('--')) throw new Error('Expected --real PATH --mode rules|hybrid, or --calibration PATH --heldout PATH --mode hybrid [--margins LIST --topics LIST]')
  if (flags.has(key)) throw new Error(`Duplicate option ${key}`)
  flags.set(key, value)
}
const mode = flags.get('--mode') ?? 'rules'
if (!['rules', 'hybrid'].includes(mode)) throw new Error('Mode must be rules or hybrid')
const calibrate = flags.has('--calibration') || flags.has('--heldout')
if (calibrate && (!flags.has('--calibration') || !flags.has('--heldout') || flags.has('--real') || mode !== 'hybrid')) throw new Error('Calibration requires separate --calibration and --heldout paths, --mode hybrid, and no --real option')
if (!calibrate && (flags.has('--margins') || flags.has('--topics'))) throw new Error('Candidate thresholds require a calibration dataset')

const seed = await readFeedbackDataset(resolve('src/public/data/nlp/bisaya_feedback_seed.csv'), 'synthetic')
const legacy = await readFeedbackDataset(resolve('tests/data/feedback_labels.csv'), 'synthetic')
let cachedEmbedder: TextEmbedder | undefined
async function predict(samples: FeedbackSample[], thresholds = FEEDBACK_SEMANTIC_THRESHOLDS) {
  if (mode === 'rules') return samples.map(sample => analyzeFeedback(sample.text))
  if (!cachedEmbedder) {
    const underlying = await getFeedbackTextEmbedder()
    // Evaluation-only memory cache: never writes comments or embeddings to disk.
    const cache = new Map<string, number[]>()
    cachedEmbedder = async (texts, options) => {
      const missing = [...new Set(texts.filter(text => !cache.has(text)))]
      if (missing.length) {
        const vectors = (await underlying(missing, options)).tolist() as number[][]
        missing.forEach((text, i) => cache.set(text, vectors[i]))
      }
      return { tolist: () => texts.map(text => cache.get(text)) }
    }
  }
  const result = await analyzeFeedbackHybrid(samples.map(sample => sample.text), { embedder: cachedEmbedder, thresholds })
  if (result.modelStatus !== 'ready') throw new Error('Hybrid evaluation unavailable: model failed. No hybrid accuracy is reported; use --mode rules for an explicitly rules-only evaluation.')
  return result.analyses
}

function printMetrics(title: string, samples: FeedbackSample[], predictions: ReturnType<typeof analyzeFeedback>[]) {
  const metrics = feedbackMetrics(samples, predictions)
  console.log(`\n${title} (${mode}; n=${metrics.count})`)
  if (!samples.length) { console.log('No labeled rows. Accuracy and calibration are unavailable.'); return metrics }
  console.log(`Sentiment correct: ${metrics.correct}/${metrics.count}; agreement: ${((metrics.accuracy ?? 0) * 100).toFixed(1)}%`)
  console.log(`Confusion matrix: actual rows / predicted columns = ${SENTIMENTS.join(', ')}`)
  console.table(metrics.confusionMatrix.map((row, i) => Object.fromEntries([['actual', SENTIMENTS[i]], ...row.map((value, j) => [SENTIMENTS[j], value])])))
  console.table(metrics.perClass)
  if (samples.some(sample => sample.topics !== null)) {
    console.table(metrics.perTopic)
    console.log(`Topic exact-set agreement: ${metrics.topicExact}; topic macro F1: ${metrics.topicMacroF1}`)
  }
  console.log('Suggestion metrics:', metrics.suggestion)
  console.log('Zero-support precision/recall/F1 are shown as 0; unsupported classes cannot establish accuracy. Topic labels must include ALL applicable topics.')
  console.log('No comment text, participant identifiers, or reviewer notes are printed.')
  return metrics
}

function hasCoverage(samples: FeedbackSample[]) {
  return SENTIMENTS.every(label => samples.some(sample => sample.sentiment === label)) && TOPICS.every(topic =>
    samples.some(sample => sample.topics?.includes(topic)) && samples.some(sample => sample.topics !== null && !sample.topics.includes(topic)))
}
function candidates(flag: string, defaults: number[], minimum: number) {
  const values = flags.has(flag) ? flags.get(flag)!.split(',').map(Number) : defaults
  if (!values.length || values.some(value => !Number.isFinite(value) || value < minimum || value > 1)) throw new Error(`Invalid candidates for ${flag}`)
  return [...new Set(values)]
}

if (calibrate) {
  const calibrationPath = resolve(flags.get('--calibration')!), heldoutPath = resolve(flags.get('--heldout')!)
  if (calibrationPath.toLowerCase() === heldoutPath.toLowerCase()) throw new Error('Calibration and held-out paths must differ')
  const calibration = await readFeedbackDataset(calibrationPath, 'real', 'calibration')
  const heldout = await readFeedbackDataset(heldoutPath, 'real', 'heldout')
  assertSeparateFeedbackSets(calibration, heldout)
  assertSeparateFeedbackSets([...seed, ...legacy], [...calibration, ...heldout])
  if (!calibration.length || !heldout.length) {
    console.log('Real calibration/held-out rows are missing. Thresholds remain 0.035 and 0.82; no model was loaded and no real-world accuracy was measured.')
  } else if (!hasCoverage(calibration) || !hasCoverage(heldout)) {
    console.log('Insufficient coverage of all five sentiments and positive/negative labels for all six topics. Reporting defaults descriptively; no threshold selection.')
    printMetrics('Real calibration baseline', calibration, await predict(calibration))
    printMetrics('Real held-out baseline (incomplete coverage)', heldout, await predict(heldout))
  } else {
    const margins = candidates('--margins', [FEEDBACK_SEMANTIC_THRESHOLDS.sentimentMargin, 0.02, 0.05], Number.EPSILON)
    const topics = candidates('--topics', [FEEDBACK_SEMANTIC_THRESHOLDS.topicSimilarity, 0.8, 0.85], 0)
    const choices: { thresholds: FeedbackSemanticThresholds; objective: number }[] = []
    for (const sentimentMargin of margins) for (const topicSimilarity of topics) {
      const thresholds = { sentimentMargin, topicSimilarity }
      const metrics = feedbackMetrics(calibration, await predict(calibration, thresholds))
      choices.push({ thresholds, objective: (metrics.macroF1 + metrics.topicMacroF1) / 2 })
    }
    choices.sort((a, b) => b.objective - a.objective)
    console.log('Exploratory calibration grid (equal sentiment/topic macro-F1 objective; not proof of optimality):')
    console.table(choices.map(choice => ({ ...choice.thresholds, calibrationObjective: choice.objective })))
    const selected = choices[0].thresholds
    console.log('Calibration-selected candidate:', selected, 'Production defaults are unchanged. Review class support, label quality, and held-out results before adopting it.')
    printMetrics('Real held-out evaluation (used only after selection)', heldout, await predict(heldout, selected))
  }
} else if (flags.has('--real')) {
  const samples = await readFeedbackDataset(resolve(flags.get('--real')!), 'real')
  assertSeparateFeedbackSets([...seed, ...legacy], samples)
  printMetrics('Manually labeled real held-out feedback', samples, samples.length ? await predict(samples) : [])
} else {
  console.log('SYNTHETIC DEVELOPMENT / REGRESSION RESULTS ONLY. These examples informed the rules and references; these are not real-world accuracy estimates or an unbiased test set.')
  printMetrics('Supplied Bisaya synthetic development set', seed, await predict(seed))
  printMetrics('Existing synthetic development set', legacy, await predict(legacy))
}
