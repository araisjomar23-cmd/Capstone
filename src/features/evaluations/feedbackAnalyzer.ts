import rawLexicon from './feedbackLexicon.json' with { type: 'json' }

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
  score: number
  matchedTerms: MatchedSentimentTerm[]
  themes: FeedbackTheme[]
}

export interface HybridFeedbackBatch {
  analyses: FeedbackAnalysis[]
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
}

const lexicon = rawLexicon as FeedbackLexicon

const SEMANTIC_MODEL = 'Xenova/multilingual-e5-small'
const SEMANTIC_MODEL_REVISION = '0b7ea4d6ad2e9d527e013a65b805a4b4df72f648'
const SENTIMENT_PROTOTYPES: Record<'positive' | 'negative' | 'mixed' | 'neutral', string[]> = {
  positive: [
    'The participant enjoyed the activity and found it helpful, well organized, and worth attending.',
    'Nindot ug lingaw ang kalihokan. Daghan kog nakat-onan ug natabangan ko niini.',
    'Maayo ang programa ug nalipay ang partisipante sa iyang naagian.',
  ],
  negative: [
    'The participant disliked the activity and found it unhelpful, uncomfortable, or poorly organized.',
    'Dili maayo ang kalihokan. Wala ko ganahi ug wala koy nakat-onan.',
    'Lisod ug bati ang programa ug nasagmuyo ang partisipante.',
  ],
  mixed: [
    'The participant liked some parts of the activity but had problems with other parts.',
    'Kapoy pero lingaw ang kalihokan; naa koy ganahan ug naa pud koy reklamo.',
    'Maayo ang topic apan bati ang venue o schedule.',
  ],
  neutral: [
    'The participant describes what happened without expressing an opinion or emotion.',
    'Ang partisipante naghisgot lamang sa nahitabo nga walay pagdayeg o reklamo.',
  ],
}

const SEMANTIC_THEME_PROTOTYPES: Record<string, string[]> = {
  venue: ['Feedback about the activity venue, location, room, facilities, cleanliness, or comfort.', 'Komento bahin sa lugar, venue, kwarto, kasaba, kainit, kalimpyo, o kaharuhay.'],
  schedule: ['Feedback about the activity schedule, timing, duration, delays, or start time.', 'Komento bahin sa oras, iskedyul, gidugayon, paglangan, o pagsugod sa kalihokan.'],
  food: ['Feedback about food, meals, snacks, drinks, or refreshments.', 'Komento bahin sa pagkaon, paniudto, snacks, tubig, o refreshments.'],
  facilitators: ['Feedback about the facilitators, speakers, trainers, organizers, or staff.', 'Komento bahin sa facilitator, speaker, trainer, organizer, o staff.'],
  content: ['Feedback about the activity topic, lessons, learning, skills, or session content.', 'Komento bahin sa hilisgutan, leksyon, nakat-onan, kahanas, o sulod sa sesyon.'],
}

type TextEmbedder = (texts: string[], options: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): unknown }>
let textEmbedderPromise: Promise<TextEmbedder> | null = null
let semanticPrototypeVectorsPromise: Promise<{ sentiments: Record<string, number[][]>; themes: Record<string, number[][]> }> | null = null

async function getTextEmbedder(): Promise<TextEmbedder> {
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

async function embedTexts(texts: string[]): Promise<number[][]> {
  const embedder = await getTextEmbedder()
  const embeddings: number[][] = []
  for (let offset = 0; offset < texts.length; offset += 16) {
    const batch = texts.slice(offset, offset + 16).map((text) => `query: ${text}`)
    const result = await embedder(batch, { pooling: 'mean', normalize: true })
    embeddings.push(...result.tolist() as number[][])
  }
  return embeddings
}

async function getSemanticPrototypeVectors() {
  if (!semanticPrototypeVectorsPromise) {
    semanticPrototypeVectorsPromise = (async () => {
      const sentimentEntries = Object.entries(SENTIMENT_PROTOTYPES)
      const themeEntries = Object.entries(SEMANTIC_THEME_PROTOTYPES)
      const allTexts = [
        ...sentimentEntries.flatMap(([, examples]) => examples),
        ...themeEntries.flatMap(([, examples]) => examples),
      ]
      const vectors = await embedTexts(allTexts)
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
    })().catch((error) => {
      semanticPrototypeVectorsPromise = null
      throw error
    })
  }
  return semanticPrototypeVectorsPromise
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
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

function classifySemanticSentiment(vector: number[], prototypes: Record<string, number[][]>) {
  const ranked = Object.entries(prototypes)
    .map(([label, examples]) => ({ label, score: meanSimilarity(vector, examples) }))
    .sort((left, right) => right.score - left.score)
  const best = ranked[0]
  const next = ranked[1]
  if (!best || !next || best.label === 'neutral' || best.score - next.score < 0.035) return null
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

function splitFeedbackClauses(text: string): string[] {
  return text
    .split(/[,;.!?\n]+|\b(?:pero|but|apan|kaso)\b/iu)
    .map((clause) => clause.trim())
    .filter(Boolean)
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
    if (token === '<comma>' || token === '<sentence>' || ['pero', 'but', 'apan', 'kaso'].includes(token)) return false
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

function findMatches(
  tokens: string[],
  candidates: Array<WeightedTerm & { sentiment: SentimentPolarity }>,
  exceptionIndexes: Set<number>
): MatchedSentimentTerm[] {
  return findMatchesWithPositions(tokens, candidates, exceptionIndexes).map(({ match }) => match)
}

function findMatchesWithPositions(
  tokens: string[],
  candidates: Array<WeightedTerm & { sentiment: SentimentPolarity }>,
  exceptionIndexes: Set<number>
): Array<{ match: MatchedSentimentTerm; start: number; end: number }> {
  const ordered = candidates
    .map((candidate) => ({ ...candidate, tokens: tokensOf(candidate.term) }))
    .sort((a, b) => b.tokens.length - a.tokens.length || b.term.length - a.term.length)
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
  const tokens = feedbackTokensOf(text)
  if (!tokens.length) return { label: 'no-signal', score: 0, matchedTerms: [], themes: [] }

  const exceptionIndexes = new Set<number>()
  for (const exception of lexicon.negationExceptions) {
    findPhraseIndexes(tokens, tokensOf(exception)).forEach((index) => exceptionIndexes.add(index))
  }

  const candidates = [
    ...lexicon.positive.map((term) => ({ ...term, sentiment: 'positive' as const })),
    ...lexicon.negative.map((term) => ({ ...term, sentiment: 'negative' as const })),
  ]
  const matchedTerms = findMatches(tokens, candidates, exceptionIndexes)
  const positiveWeight = matchedTerms.filter((match) => match.sentiment === 'positive').reduce((sum, match) => sum + match.weight, 0)
  const negativeWeight = matchedTerms.filter((match) => match.sentiment === 'negative').reduce((sum, match) => sum + match.weight, 0)
  const signalWeight = positiveWeight + negativeWeight
  const score = signalWeight ? Number(((positiveWeight - negativeWeight) / signalWeight).toFixed(2)) : 0
  const hasPositive = positiveWeight > 0
  const hasNegative = negativeWeight > 0
  const label: SuggestedSentiment = hasPositive && hasNegative
    ? score >= 0.7 ? 'positive' : score <= -0.7 ? 'negative' : 'mixed'
    : hasPositive ? 'positive'
      : hasNegative ? 'negative' : 'no-signal'

  const themeSignals = new Map<string, {
    positive: number
    negative: number
    terms: Set<string>
  }>()
  for (const clause of splitFeedbackClauses(text)) {
    const clauseTokens = feedbackTokensOf(clause)
    const clauseExceptions = new Set<number>()
    for (const exception of lexicon.negationExceptions) {
      findPhraseIndexes(clauseTokens, tokensOf(exception)).forEach((index) => clauseExceptions.add(index))
    }
    const clauseMatches = findMatchesWithPositions(clauseTokens, candidates, clauseExceptions)
    for (const [theme, phrases] of Object.entries(lexicon.themes)) {
      const occurrences = phrases.flatMap((phrase) =>
        findPhraseStarts(clauseTokens, tokensOf(phrase)).map((start) => ({ phrase, start, end: start + tokensOf(phrase).length }))
      )
      if (!occurrences.length) continue

      const signal = themeSignals.get(theme) || { positive: 0, negative: 0, terms: new Set<string>() }
      for (const occurrence of occurrences) {
        const nearestMatch = clauseMatches
          .map((candidate) => ({
            ...candidate,
            distance: candidate.end <= occurrence.start
              ? occurrence.start - candidate.end
              : candidate.start >= occurrence.end
                ? candidate.start - occurrence.end
                : 0,
          }))
          .filter((candidate) => candidate.distance <= 5)
          .sort((left, right) => left.distance - right.distance)[0]
        if (nearestMatch?.match.sentiment === 'positive') signal.positive += nearestMatch.match.weight
        if (nearestMatch?.match.sentiment === 'negative') signal.negative += nearestMatch.match.weight
        signal.terms.add(occurrence.phrase)
      }
      themeSignals.set(theme, signal)
    }
  }

  const themes: FeedbackTheme[] = [...themeSignals.entries()].map(([theme, signal]) => {
    const total = signal.positive + signal.negative
    const score = total ? Number(((signal.positive - signal.negative) / total).toFixed(2)) : 0
    const sentiment: SuggestedSentiment = signal.positive > 0 && signal.negative > 0
      ? score >= 0.7 ? 'positive' : score <= -0.7 ? 'negative' : 'mixed'
      : signal.positive > 0 ? 'positive'
        : signal.negative > 0 ? 'negative' : 'no-signal'
    return { theme, sentiment, score, matchedTerms: [...signal.terms] }
  })

  return {
    label,
    score,
    matchedTerms,
    themes,
  }
}

/**
 * Adds local multilingual semantic similarities to the Bisaya-aware rules.
 * Feedback text is embedded in the browser; only model weights are downloaded.
 * If model loading fails, the rule analysis remains available.
 */
export async function analyzeFeedbackHybrid(comments: string[]): Promise<HybridFeedbackBatch> {
  const analyses = comments.map(analyzeFeedback)
  if (!comments.length) {
    return { analyses, semanticAssistedComments: 0, modelStatus: 'not-needed' }
  }

  try {
    const [prototypeVectors, commentVectors] = await Promise.all([
      getSemanticPrototypeVectors(),
      embedTexts(comments),
    ])
    let semanticAssistedComments = 0

    analyses.forEach((analysis, index) => {
      const vector = commentVectors[index]
      if (!vector) return

      let assisted = false
      const semanticSentiment = classifySemanticSentiment(vector, prototypeVectors.sentiments)
      if (analysis.label === 'no-signal' && semanticSentiment) {
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
        if (similarity < 0.82) continue
        analysis.themes.push({
          theme,
          sentiment: semanticSentiment?.label || 'no-signal',
          score: semanticSentiment?.label === 'positive' ? semanticSentiment.score
            : semanticSentiment?.label === 'negative' ? -semanticSentiment.score : 0,
          matchedTerms: ['multilingual semantic similarity'],
        })
        assisted = true
      }

      if (assisted) semanticAssistedComments += 1
    })

    return { analyses, semanticAssistedComments, modelStatus: 'ready' }
  } catch (error) {
    return {
      analyses,
      semanticAssistedComments: 0,
      modelStatus: 'unavailable',
      modelError: error instanceof Error ? error.message : String(error),
    }
  }
}
