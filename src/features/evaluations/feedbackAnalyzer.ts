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
  matchedTerms: string[]
}

export interface FeedbackAnalysis {
  label: SuggestedSentiment
  score: number
  matchedTerms: MatchedSentimentTerm[]
  themes: FeedbackTheme[]
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
  return text.split(',').flatMap((part, index, parts) => [
    ...normalize(part).split(/\s+/u).filter(Boolean),
    ...(index < parts.length - 1 ? ['<comma>'] : []),
  ])
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

function isNegated(tokens: string[], termStart: number, exceptionIndexes: Set<number>): boolean {
  const particles = new Set(['ko', 'koy', 'mi', 'ka', 'nako', 'ra'])
  const negators = new Set(lexicon.negators.flatMap((item) => {
    const parts = tokensOf(item)
    return parts.length === 1 ? parts : []
  }))
  let distance = 0
  for (let index = termStart - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token === '<comma>' || ['pero', 'but', 'apan', 'kaso'].includes(token)) return false
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
    if (token === '<comma>') return 1
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
  const ordered = candidates
    .map((candidate) => ({ ...candidate, tokens: tokensOf(candidate.term) }))
    .sort((a, b) => b.tokens.length - a.tokens.length || b.term.length - a.term.length)
  const occupied = new Set<number>()
  const matches: MatchedSentimentTerm[] = []

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
        term: candidate.term,
        sentiment: negated
          ? candidate.sentiment === 'positive' ? 'negative' : 'positive'
          : candidate.sentiment,
        weight: Number((candidate.weight * multiplier).toFixed(2)),
        negated,
        ambiguous: lexicon.ambiguousTerms.includes(candidate.term),
      })
    }
  }
  return matches
}

export function analyzeFeedback(text: string): FeedbackAnalysis {
  const tokens = tokensOf(text)
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

  const themeMatches = new Map<string, Set<string>>()
  for (const [theme, phrases] of Object.entries(lexicon.themes)) {
    for (const phrase of phrases) {
      const normalizedPhrase = tokensOf(phrase)
      if (findPhraseIndexes(tokens, normalizedPhrase).length) {
        const terms = themeMatches.get(theme) || new Set<string>()
        terms.add(phrase)
        themeMatches.set(theme, terms)
      }
    }
  }

  return {
    label,
    score,
    matchedTerms,
    themes: [...themeMatches.entries()].map(([theme, terms]) => ({ theme, matchedTerms: [...terms] })),
  }
}
