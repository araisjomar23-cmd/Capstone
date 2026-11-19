import rawLexicon from './feedbackLexicon.json' with { type: 'json' }
import semanticReferences from './feedbackSemanticReferences.json' with { type: 'json' }

export type SuggestedSentiment = 'positive' | 'negative' | 'mixed' | 'no-signal'
export type SentimentPolarity = 'positive' | 'negative'

export interface MatchedSentimentTerm {
  term: string
  sentiment: SentimentPolarity
  weight: number
  negated: boolean
  ambiguous: boolean
}

export interface FeedbackTheme {
  theme: string
  sentiment: SuggestedSentiment
  score: number
  matchedTerms: string[]
}

export interface FeedbackAnalysis {
  label: SuggestedSentiment
  /** Absent means false, preserving the existing analysis contract. */
  isSuggestion?: boolean
  score: number
  matchedTerms: MatchedSentimentTerm[]
  themes: FeedbackTheme[]
}

export interface HybridFeedbackBatch {
  analyses: FeedbackAnalysis[]
  sentimentSources: ('rules' | 'semantic' | 'none')[]
  semanticAssistedComments: number
  modelStatus: 'not-needed' | 'ready' | 'unavailable'
  modelError?: string
}

interface WeightedTerm {
  term: string
  weight: number
}

interface FeedbackLexicon {
  positive: WeightedTerm[]
  negative: WeightedTerm[]
  themes: Record<string, string[]>
  negators: string[]
  negationWindow: number
  negationExceptions: string[]
  intensifiers: Record<string, number>
  diminishers: Record<string, number>
  spellingVariants: Record<string, string>
  ambiguousTerms: string[]
  contrastMarkers: string[]
  suggestionMarkers: string[]
  feedbackContext: string[]
  ambiguousThemeTerms: Record<string, string[]>
}

const lexicon = rawLexicon as FeedbackLexicon

const SEMANTIC_MODEL = 'Xenova/multilingual-e5-small'
const SEMANTIC_MODEL_REVISION = '0b7ea4d6ad2e9d527e013a65b805a4b4df72f648'
const SENTIMENT_PROTOTYPES: Record<string, string[]> = semanticReferences.sentiments
const SEMANTIC_THEME_PROTOTYPES: Record<string, string[]> = semanticReferences.themes
// Historical defaults, not validated confidence probabilities. Real calibration
// must be performed separately from held-out evaluation before changing these.
export interface FeedbackSemanticThresholds { sentimentMargin: number; topicSimilarity: number }
export const FEEDBACK_SEMANTIC_THRESHOLDS: Readonly<FeedbackSemanticThresholds> = Object.freeze({ sentimentMargin: 0.035, topicSimilarity: 0.82 })
export interface FeedbackAnalyzerOptions {
  /** Dependency injection for offline regression tests; production uses E5. */
  embedder?: TextEmbedder
  thresholds?: FeedbackSemanticThresholds
}

export type TextEmbedder = (texts: string[], options: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): unknown }>
let textEmbedderPromise: Promise<TextEmbedder> | null = null
let semanticPrototypeVectorsPromise: Promise<{ sentiments: Record<string, number[][]>; themes: Record<string, number[][]> }> | null = null

export async function getFeedbackTextEmbedder(): Promise<TextEmbedder> {
  if (!textEmbedderPromise) {
    textEmbedderPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers')
      return await pipeline('feature-extraction', SEMANTIC_MODEL, {
        revision: SEMANTIC_MODEL_REVISION,
        dtype: 'q8',
      }) as unknown as TextEmbedder
    })().catch((error) => {
      textEmbedderPromise = null
      throw error
    })
  }
  return textEmbedderPromise
}

async function embedTexts(texts: string[], override?: TextEmbedder): Promise<number[][]> {
  const embedder = override ?? await getFeedbackTextEmbedder()
  const embeddings: number[][] = []
  for (let offset = 0; offset < texts.length; offset += 16) {
    const batch = texts.slice(offset, offset + 16).map((text) => `query: ${text}`)
    const result = await embedder(batch, { pooling: 'mean', normalize: true })
    const vectors = result.tolist() as number[][]
    if (!Array.isArray(vectors) || vectors.length !== batch.length || vectors.some(vector => !Array.isArray(vector) || !vector.length || vector.some(value => !Number.isFinite(value)) || !vector.some(value => value !== 0))) throw new Error('Invalid semantic embeddings')
    embeddings.push(...vectors)
  }
  return embeddings
}

async function getSemanticPrototypeVectors(override?: TextEmbedder) {
  const build = async () => {
      const sentimentEntries = Object.entries(SENTIMENT_PROTOTYPES)
      const themeEntries = Object.entries(SEMANTIC_THEME_PROTOTYPES)
      const allTexts = [
        ...sentimentEntries.flatMap(([, examples]) => examples),
        ...themeEntries.flatMap(([, examples]) => examples),
      ]
      const vectors = await embedTexts(allTexts, override)
      let offset = 0
      const sentiments: Record<string, number[][]> = {}
      for (const [label, examples] of sentimentEntries) {
        sentiments[label] = vectors.slice(offset, offset + examples.length)
        offset += examples.length
      }
      const themes: Record<string, number[][]> = {}
      for (const [theme, examples] of themeEntries) {
        themes[theme] = vectors.slice(offset, offset + examples.length)
        offset += examples.length
      }
      return { sentiments, themes }
  }
  if (override) return build()
  if (!semanticPrototypeVectorsPromise) {
    semanticPrototypeVectorsPromise = build().catch((error) => {
      semanticPrototypeVectorsPromise = null
      throw error
    })
  }
  return semanticPrototypeVectorsPromise
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) throw new Error('Inconsistent semantic embedding dimensions')
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] ** 2
    rightMagnitude += right[index] ** 2
  }
  return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0
}

function meanSimilarity(vector: number[], prototypes: number[][] = []): number {
  return prototypes.length
    ? prototypes.reduce((sum, prototype) => sum + cosineSimilarity(vector, prototype), 0) / prototypes.length
    : 0
}

function classifySemanticSentiment(vector: number[], prototypes: Record<string, number[][]>, margin: number) {
  const ranked = Object.entries(prototypes)
    .map(([label, examples]) => ({ label, score: meanSimilarity(vector, examples) }))
    .sort((left, right) => right.score - left.score)
  const best = ranked[0]
  const next = ranked[1]
  if (!best || !next || best.label === 'neutral' || best.score - next.score < margin) return null
  return {
    label: best.label as Exclude<SuggestedSentiment, 'no-signal'>,
    score: best.score - next.score,
  }
}

function baseNormalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/([\p{L}])\1{2,}/gu, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalize(text: string): string {
  let normalized = baseNormalize(text)
  const variants = Object.entries(lexicon.spellingVariants)
    .map(([variant, canonical]) => [baseNormalize(variant), baseNormalize(canonical)] as const)
    .sort(([a], [b]) => b.length - a.length)

  for (const [variant, canonical] of variants) {
    if (!variant) continue
    normalized = normalized.replace(
      new RegExp(`(^| )${escapeRegExp(variant)}(?= |$)`, 'gu'),
      (_match, prefix: string) => `${prefix}${canonical}`
    )
  }
  return normalized.trim()
}

function tokensOf(text: string): string[] {
  return normalize(text).split(/\s+/u).filter(Boolean)
}

function feedbackTokensOf(text: string): string[] {
  return text.split(/([,;.!?\n]+)/u).flatMap((part) => {
    if (!part) return []
    if (/^[,;.!?\n]+$/u.test(part)) {
      return [part.includes(',') ? '<comma>' : '<sentence>']
    }
    return tokensOf(part)
  })
}

function hasPhrase(tokens: string[], phrases: string[]) {
  return phrases.some(phrase => findPhraseStarts(tokens, tokensOf(phrase)).length > 0)
}

function splitFeedbackClauses(text: string) {
  const markers = lexicon.contrastMarkers.map(escapeRegExp).join('|')
  const requests = lexicon.suggestionMarkers.map(escapeRegExp).join('|')
  const parts = text.split(new RegExp('([,;.!?\\n]+|\\b(?:' + markers + '|kay|because)\\b)', 'iu'))
  const clauses: { text: string; continuation: boolean }[] = []
  let continuation = false
  for (const part of parts) {
    if (!part.trim()) continue
    if (/^[,;.!?\n]+$/.test(part)) { continuation = false; continue }
    if (lexicon.contrastMarkers.some(marker => normalize(marker) === normalize(part)) || /^(kay|because)$/i.test(part.trim())) {
      continuation = true; continue
    }
    // Keep an assertion before a request, even when the participant omits punctuation.
    for (const segment of part.split(new RegExp('(?=\\b(?:' + requests + ')\\b)', 'iu'))) {
      if (!segment.trim()) continue
      clauses.push({ text: segment.trim(), continuation }); continuation = false
    }
  }
  return clauses
}

function phraseAt(tokens: string[], phrase: string[], start: number): boolean {
  return phrase.length > 0 && phrase.every((token, offset) => tokens[start + offset] === token)
}

function findPhraseIndexes(tokens: string[], phrase: string[]): number[] {
  const indexes: number[] = []
  for (let start = 0; start <= tokens.length - phrase.length; start += 1) {
    if (phraseAt(tokens, phrase, start)) {
      for (let offset = 0; offset < phrase.length; offset += 1) indexes.push(start + offset)
    }
  }
  return indexes
}

function findPhraseStarts(tokens: string[], phrase: string[]): number[] {
  const starts: number[] = []
  for (let start = 0; start <= tokens.length - phrase.length; start += 1) {
    if (phraseAt(tokens, phrase, start)) starts.push(start)
  }
  return starts
}

function isNegated(tokens: string[], termStart: number, exceptionIndexes: Set<number>): boolean {
  const particles = new Set(['ko', 'koy', 'mi', 'ka', 'nako', 'ra'])
  const negators = new Set(lexicon.negators.flatMap((item) => {
    const parts = tokensOf(item)
    return parts.length === 1 ? parts : []
  }))
  let distance = 0
  for (let index = termStart - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token === '<comma>' || token === '<sentence>' || lexicon.contrastMarkers.includes(token)) return false
    if (exceptionIndexes.has(index)) return false
    if (particles.has(token)) continue
    distance += 1
    if (distance > lexicon.negationWindow) break
    if (negators.has(token)) return true
  }
  return false
}

function contrastMultiplier(tokens: string[], start: number): number {
  for (let index = start - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token === '<comma>' || token === '<sentence>') return 1
    if (['pero', 'but', 'apan', 'kaso'].includes(token)) return 1.3
  }
  return 1
}

function intensityMultiplier(tokens: string[], start: number, length: number): number {
  const nearby = [tokens[start - 1], tokens[start + length], tokens[start - 2], tokens[start + length + 1]]
  for (const word of nearby) {
    if (!word) continue
    if (Object.hasOwn(lexicon.intensifiers, word)) return lexicon.intensifiers[word]
    if (Object.hasOwn(lexicon.diminishers, word)) return lexicon.diminishers[word]
  }
  return 1
}

function findMatchesWithPositions(
  tokens: string[],
  candidates: Array<WeightedTerm & { sentiment: SentimentPolarity }>,
  exceptionIndexes: Set<number>
): Array<{ match: MatchedSentimentTerm; start: number; end: number }> {
  const ordered = candidates
    .map((candidate) => ({ ...candidate, tokens: tokensOf(candidate.term) }))
    .sort((a, b) => b.tokens.length - a.tokens.length || b.term.length - a.term.length)
    .filter((item, index, items) => items.findIndex(other => other.tokens.join(' ') === item.tokens.join(' ')) === index)
  const occupied = new Set<number>()
  const matches: Array<{ match: MatchedSentimentTerm; start: number; end: number }> = []

  for (const candidate of ordered) {
    if (!candidate.tokens.length) continue
    for (let start = 0; start <= tokens.length - candidate.tokens.length; start += 1) {
      if (!phraseAt(tokens, candidate.tokens, start)) continue
      const indexes = candidate.tokens.map((_token, offset) => start + offset)
      if (indexes.some((index) => occupied.has(index))) continue
      indexes.forEach((index) => occupied.add(index))

      const negated = isNegated(tokens, start, exceptionIndexes)
      const multiplier = intensityMultiplier(tokens, start, candidate.tokens.length) * contrastMultiplier(tokens, start)
      matches.push({
        match: {
          term: candidate.term,
          sentiment: negated
            ? candidate.sentiment === 'positive' ? 'negative' : 'positive'
            : candidate.sentiment,
          weight: Number((candidate.weight * multiplier).toFixed(2)),
          negated,
          ambiguous: lexicon.ambiguousTerms.includes(candidate.term),
        },
        start,
        end: start + candidate.tokens.length,
      })
    }
  }
  return matches
}

export function analyzeFeedback(text: string): FeedbackAnalysis {
  if (!feedbackTokensOf(text).length) return { label: 'no-signal', score: 0, matchedTerms: [], themes: [] }
  const candidates = [
    ...lexicon.positive.map(term => ({ ...term, sentiment: 'positive' as const })),
    ...lexicon.negative.map(term => ({ ...term, sentiment: 'negative' as const })),
  ]
  const matchedTerms: MatchedSentimentTerm[] = []
  const themeSignals = new Map<string, { positive: number; negative: number; terms: Set<string> }>()
  let previousThemes: string[] = []
  let isSuggestion = false
  let positiveAssertion = false
  let negativeAssertion = false

  for (const clause of splitFeedbackClauses(text)) {
    const tokens = feedbackTokensOf(clause.text)
    const suggestion = hasPhrase(tokens, lexicon.suggestionMarkers)
    isSuggestion ||= suggestion
    const exceptions = new Set<number>()
    for (const phrase of lexicon.negationExceptions) findPhraseIndexes(tokens, tokensOf(phrase)).forEach(index => exceptions.add(index))
    // A wish or request does not assert that the current activity is good/bad.
    // Separate assertions after punctuation, contrast, or "kay/because" still count.
    const matches = suggestion ? [] : findMatchesWithPositions(tokens, candidates, exceptions)
    if (clause.continuation) for (const item of matches) item.match.weight = Number((item.match.weight * 1.3).toFixed(2))
    matchedTerms.push(...matches.map(item => item.match))
    positiveAssertion ||= matches.some(item => item.match.sentiment === 'positive' && !item.match.ambiguous)
    negativeAssertion ||= matches.some(item => item.match.sentiment === 'negative' && !item.match.ambiguous)
    const found = Object.entries(lexicon.themes).map(([theme, phrases]) => ({ theme, occurrences: phrases.flatMap(phrase =>
      findPhraseStarts(tokens, tokensOf(phrase)).filter(start => !(phrase === 'time' && tokens[start - 1] === 'next')).map(start => ({ phrase, start, end: start + tokensOf(phrase).length }))
    ) })).filter(item => item.occurrences.length)
    const explicit = found.filter(item => item.occurrences.some(occurrence => !lexicon.ambiguousThemeTerms[item.theme]?.includes(occurrence.phrase)))
    let selected = found.filter(item => !explicit.length || explicit.some(other => other.theme === item.theme))
    if (clause.continuation && !explicit.length && previousThemes.length === 1) {
      selected = selected.filter(item => item.theme === previousThemes[0])
    }
    // An unnamed contrast clause can continue exactly one previous aspect.
    // Never carry across a sentence, a new explicit aspect, or an ambiguous list.
    if (!selected.length && clause.continuation && previousThemes.length === 1 && matches.length) {
      selected.push({ theme: previousThemes[0], occurrences: [] })
    }
    for (const item of selected) {
      const signal = themeSignals.get(item.theme) ?? { positive: 0, negative: 0, terms: new Set<string>() }
      const distance = (match: typeof matches[number], occurrence: { start: number; end: number }) => Math.max(0, occurrence.start - match.end, match.start - occurrence.end)
      const relevant = item.occurrences.length ? matches.filter(match => {
        const closest = Math.min(...selected.flatMap(aspect => aspect.occurrences.map(occurrence => distance(match, occurrence))))
        return closest <= 5 && item.occurrences.some(occurrence => distance(match, occurrence) === closest)
      }) : matches
      // A sentiment match is counted once per aspect, even with repeated topic aliases.
      for (const { match } of relevant) signal[match.sentiment] += match.weight
      item.occurrences.forEach(occurrence => signal.terms.add(occurrence.phrase))
      if (!item.occurrences.length) matches.forEach(match => signal.terms.add(match.match.term))
      themeSignals.set(item.theme, signal)
    }
    previousThemes = selected.map(item => item.theme)
  }
  const positive = matchedTerms.filter(match => match.sentiment === 'positive').reduce((sum, match) => sum + match.weight, 0)
  const negative = matchedTerms.filter(match => match.sentiment === 'negative').reduce((sum, match) => sum + match.weight, 0)
  const score = positive + negative ? Number(((positive - negative) / (positive + negative)).toFixed(2)) : 0
  const label: SuggestedSentiment = positive && negative
    ? positiveAssertion && negativeAssertion ? 'mixed' : score >= 0.7 ? 'positive' : score <= -0.7 ? 'negative' : 'mixed'
    : positive ? 'positive' : negative ? 'negative' : 'no-signal'
  const themes: FeedbackTheme[] = [...themeSignals.entries()].map(([theme, signal]) => ({
    theme, sentiment: signal.positive && signal.negative ? 'mixed' : signal.positive ? 'positive' : signal.negative ? 'negative' : 'no-signal',
    score: signal.positive + signal.negative ? Number(((signal.positive - signal.negative) / (signal.positive + signal.negative)).toFixed(2)) : 0,
    matchedTerms: [...signal.terms],
  }))
  return { label, score, matchedTerms, themes, ...(isSuggestion ? { isSuggestion: true } : {}) }
}

/**
 * Adds local multilingual semantic similarities to the Bisaya-aware rules.
 * Feedback text is embedded in the browser; only model weights are downloaded.
 * If model loading fails, the rule analysis remains available.
 */
export async function analyzeFeedbackHybrid(comments: string[], options: FeedbackAnalyzerOptions = {}): Promise<HybridFeedbackBatch> {
  const analyses = comments.map(analyzeFeedback)
  const sentimentSources: HybridFeedbackBatch['sentimentSources'] = analyses.map((analysis) => analysis.label === 'no-signal' ? 'none' : 'rules')
  if (!comments.length) {
    return { analyses, sentimentSources, semanticAssistedComments: 0, modelStatus: 'not-needed' }
  }

  try {
    const thresholds = options.thresholds ?? FEEDBACK_SEMANTIC_THRESHOLDS
    if (!Number.isFinite(thresholds.sentimentMargin) || thresholds.sentimentMargin <= 0 || thresholds.sentimentMargin > 1 || !Number.isFinite(thresholds.topicSimilarity) || thresholds.topicSimilarity < 0 || thresholds.topicSimilarity > 1) throw new Error('Invalid semantic thresholds')
    const [prototypeVectors, commentVectors] = await Promise.all([
      getSemanticPrototypeVectors(options.embedder),
      embedTexts(comments, options.embedder),
    ])
    let semanticAssistedComments = 0

    analyses.forEach((analysis, index) => {
      const vector = commentVectors[index]
      if (!vector) return

      let assisted = false
      const context = hasPhrase(feedbackTokensOf(comments[index]), lexicon.feedbackContext)
      if (!context && !analysis.themes.length && !analysis.matchedTerms.length) return
      const semanticSentiment = classifySemanticSentiment(vector, prototypeVectors.sentiments, thresholds.sentimentMargin)
      if (analysis.label === 'no-signal' && !analysis.isSuggestion && semanticSentiment) {
        sentimentSources[index] = 'semantic'
        analysis.label = semanticSentiment.label
        analysis.score = semanticSentiment.label === 'positive'
          ? semanticSentiment.score
          : semanticSentiment.label === 'negative'
            ? -semanticSentiment.score
            : 0
        assisted = true
      }

      const existingThemes = new Set(analysis.themes.map(({ theme }) => theme))
      for (const [theme, prototypes] of Object.entries(prototypeVectors.themes)) {
        if (existingThemes.has(theme)) continue
        const similarity = meanSimilarity(vector, prototypes)
        if (similarity < thresholds.topicSimilarity) continue
        // Topic similarity must also beat the neutral/off-topic references.
        if (similarity <= meanSimilarity(vector, prototypeVectors.sentiments.neutral)) continue
        analysis.themes.push({
          theme,
          sentiment: 'no-signal',
          score: 0,
          matchedTerms: ['multilingual semantic similarity'],
        })
        assisted = true
      }

      if (assisted) semanticAssistedComments += 1
    })

    return { analyses, sentimentSources, semanticAssistedComments, modelStatus: 'ready' }
  } catch (error) {
    return {
      analyses: comments.map(analyzeFeedback),
      sentimentSources: comments.map(comment => analyzeFeedback(comment).label === 'no-signal' ? 'none' : 'rules'),
      semanticAssistedComments: 0,
      modelStatus: 'unavailable',
      modelError: error instanceof Error ? error.message : String(error),
    }
  }
}
