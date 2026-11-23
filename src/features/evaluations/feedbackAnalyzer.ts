import rawLexicon from './feedbackLexicon.json' with { type: 'json' }
import semanticReferences from './feedbackSemanticReferences.json' with { type: 'json' }

// Keep no-signal as the existing API key; the interface displays it as Uncertain.
export type SuggestedSentiment = 'positive' | 'negative' | 'neutral' | 'mixed' | 'no-signal'
export type SentimentPolarity = 'positive' | 'negative'
export type FeedbackIntent = 'praise' | 'complaint' | 'suggestion' | 'request' | 'personal-preference' | 'general-observation' | 'unclear'
export interface FeedbackContext {
  intents: FeedbackIntent[]
  requestType?: 'personal-preference' | 'program-improvement' | 'unspecified'
  relevance: 'high' | 'medium' | 'low' | 'uncertain'
  actionability: 'actionable' | 'not-directly-actionable' | 'needs-manual-review'
  evidence: { kind: 'request' | 'preference' | 'subject'; phrase: string }[]
  personalPreferenceOnly: boolean
}

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
  context?: FeedbackContext
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
  context: { requestMarkers: string[]; preferenceMarkers: string[]; appearanceTerms: string[]; participantTerms: string[]; observationMarkers: string[]; politeSuffixes: string[] }
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

const normalizedVariants = Object.entries(lexicon.spellingVariants)
  .map(([variant, canonical]) => [baseNormalize(variant), baseNormalize(canonical)] as const)
  .sort(([a], [b]) => b.length - a.length)

function normalize(text: string): string {
  let normalized = baseNormalize(text)

  for (const [variant, canonical] of normalizedVariants) {
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

function analyzeFeedbackRules(text: string): FeedbackAnalysis {
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
    const request = hasPhrase(tokens, lexicon.context.requestMarkers)
    isSuggestion ||= suggestion
    const exceptions = new Set<number>()
    for (const phrase of lexicon.negationExceptions) findPhraseIndexes(tokens, tokensOf(phrase)).forEach(index => exceptions.add(index))
    // A wish or request does not assert that the current activity is good/bad.
    // Separate assertions after punctuation, contrast, or "kay/because" still count.
    const matches = suggestion || request || hasPhrase(tokens, lexicon.context.preferenceMarkers) ? [] : findMatchesWithPositions(tokens, candidates, exceptions)
    if (clause.continuation) for (const item of matches) item.match.weight = Number((item.match.weight * 1.3).toFixed(2))
    matchedTerms.push(...matches.map(item => item.match))
    positiveAssertion ||= matches.some(item => item.match.sentiment === 'positive' && !item.match.ambiguous)
    negativeAssertion ||= matches.some(item => item.match.sentiment === 'negative' && !item.match.ambiguous)
    const found = Object.entries(lexicon.themes).map(([theme, phrases]) => ({ theme, occurrences: phrases.flatMap(phrase =>
      findPhraseStarts(tokens, tokensOf(phrase)).filter(start => !(phrase === 'time' && tokens[start - 1] === 'next'))
        // Being the recipient of snacks does not make participants the subject.
        .filter(start => theme !== 'participants' || !['for', 'para'].includes(tokens[start - 1]) && !tokens.slice(Math.max(0, start - 3), start).includes('para'))
        .map(start => ({ phrase, start, end: start + tokensOf(phrase).length }))
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

// Locate normalized phrases while retaining exact spans from the original text.
// These spans support explanations; embedding similarities never supply word evidence.
function phraseEvidence(text: string, phrases: string[]) {
  const words = [...text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)].flatMap(match =>
    tokensOf(match[0]).map(token => ({ token, start: match.index!, end: match.index! + match[0].length })))
  return phrases.flatMap(phrase => findPhraseStarts(words.map(word => word.token), tokensOf(phrase)).map(start => {
    const end = start + tokensOf(phrase).length - 1
    return { phrase: text.slice(words[start].start, words[end].end), start, end, from: words[start].start, to: words[end].end }
  })).sort((a, b) => a.start - b.start || b.end - a.end)
}

function withFeedbackContext(text: string, analysis: FeedbackAnalysis): FeedbackAnalysis {
  if (!text.trim()) return analysis
  const intents = new Set<FeedbackIntent>()
  const evidence: FeedbackContext['evidence'] = []
  let preferenceClauses = 0, requestDetected = false, preferenceDetected = false, programRequestDetected = false
  const originalClauses = splitFeedbackClauses(text)
  const meaningfulClauses = originalClauses.filter(clause => !tokensOf(clause.text).every(token => lexicon.context.politeSuffixes.includes(token)))
  const clauses = meaningfulClauses.length ? meaningfulClauses : originalClauses
  for (const clause of clauses) {
    const requests = phraseEvidence(clause.text, lexicon.context.requestMarkers)
    const preferences = phraseEvidence(clause.text, lexicon.context.preferenceMarkers)
    const wishes = phraseEvidence(clause.text, lexicon.suggestionMarkers)
    const subjects = phraseEvidence(clause.text, [...lexicon.context.participantTerms, ...lexicon.themes.facilitators])
    const appearances = phraseEvidence(clause.text, lexicon.context.appearanceTerms)
    const pair = appearances.flatMap(appearance => subjects.filter(subject => Math.max(subject.start - appearance.end, appearance.start - subject.end) <= 3).map(subject => ({ appearance, subject })))[0]
    const negatedAppearance = pair && hasPhrase(tokensOf(clause.text).slice(Math.max(0, pair.appearance.start - 4), pair.appearance.start), lexicon.negators)
    // Merely naming the training/venue around an appearance request does not
    // turn that request into a supported program improvement.
    const clauseProgramTopic = !pair && Object.entries(lexicon.themes).some(([theme, phrases]) => theme !== 'participants' && hasPhrase(feedbackTokensOf(clause.text), phrases))
    if ((requests.length || wishes.length || preferences.length) && clauseProgramTopic) programRequestDetected = true
    if (requests.length || wishes.length) {
      requestDetected = true
      evidence.push({ kind: 'request', phrase: (requests[0] ?? wishes[0]).phrase })
    }
    if (preferences.length || (pair && (requests.length || wishes.length))) preferenceDetected = true
    const understoodTail = pair && tokensOf(clause.text.slice(Math.max(pair.appearance.to, pair.subject.to))).every(token => lexicon.context.politeSuffixes.includes(token))
    if (pair && !negatedAppearance && understoodTail && (requests.length || wishes.length || preferences.length)) {
      preferenceClauses++
      evidence.push({ kind: 'preference', phrase: clause.text.slice(Math.min(pair.appearance.from, pair.subject.from), Math.max(pair.appearance.to, pair.subject.to)) })
    }
  }
  const programTopics = analysis.themes.filter(theme => theme.theme !== 'participants')
  const personalPreferenceOnly = preferenceClauses > 0 && preferenceClauses === clauses.length && !analysis.matchedTerms.length && !programTopics.some(theme => theme.theme !== 'facilitators')
  if (requestDetected) intents.add('request')
  if (preferenceDetected) intents.add('personal-preference')
  if (analysis.matchedTerms.some(term => term.sentiment === 'positive' && !term.ambiguous)) intents.add('praise')
  if (analysis.matchedTerms.some(term => term.sentiment === 'negative' && !term.ambiguous)) intents.add('complaint')
  if (personalPreferenceOnly) {
    analysis.label = 'neutral'
    analysis.score = 0
    analysis.isSuggestion = false
    analysis.themes.forEach(theme => { theme.sentiment = 'neutral'; theme.score = 0 })
  } else if (programRequestDetected) {
    analysis.isSuggestion = true
    if (preferenceDetected && analysis.label === 'no-signal' && !analysis.matchedTerms.length) analysis.label = 'neutral'
  }
  else if (preferenceDetected) analysis.isSuggestion = false
  if (requestDetected && !programTopics.length && !hasPhrase(feedbackTokensOf(text), lexicon.feedbackContext)) analysis.isSuggestion = false
  if (analysis.isSuggestion) intents.add('suggestion')
  if (!intents.size && hasPhrase(feedbackTokensOf(text), lexicon.context.observationMarkers)) intents.add('general-observation')
  if (!intents.size) intents.add('unclear')
  const hasSubject = analysis.themes.length > 0 || hasPhrase(feedbackTokensOf(text), lexicon.feedbackContext)
  const programImprovement = !personalPreferenceOnly && programTopics.length > 0 && (intents.has('complaint') || analysis.isSuggestion === true)
  const relevance: FeedbackContext['relevance'] = personalPreferenceOnly ? 'low' : programImprovement || hasSubject && (intents.has('praise') || intents.has('complaint')) ? 'high' : hasSubject ? 'medium' : 'uncertain'
  const actionability: FeedbackContext['actionability'] = personalPreferenceOnly ? 'not-directly-actionable' : programImprovement ? 'actionable' : intents.has('praise') || intents.has('general-observation') ? 'not-directly-actionable' : 'needs-manual-review'
  return { ...analysis, context: {
    intents: [...intents], relevance, actionability, personalPreferenceOnly,
    ...(requestDetected ? { requestType: preferenceClauses && !programRequestDetected ? 'personal-preference' : programRequestDetected ? 'program-improvement' : 'unspecified' } : {}),
    evidence: evidence.filter((item, index) => evidence.findIndex(other => other.kind === item.kind && other.phrase === item.phrase) === index),
  } }
}

export function analyzeFeedback(text: string): FeedbackAnalysis {
  return withFeedbackContext(text, analyzeFeedbackRules(text))
}

export function explainFeedback(text: string, analysis: FeedbackAnalysis, source: 'rules' | 'semantic' | 'none'): string[] {
  const context = analysis.context
  if (context?.personalPreferenceOnly) {
    const request = context.evidence.find(item => item.kind === 'request' && text.includes(item.phrase))
    const preference = context.evidence.find(item => item.kind === 'preference' && text.includes(item.phrase))
    return [
      `The participant expresses a personal preference for ${analysis.themes.some(theme => theme.theme === 'participants') ? 'participants' : 'facilitators'} they consider attractive${preference ? `, expressed in “${preference.phrase}”` : ''}.`,
      ...(request ? [`“${request.phrase}” indicates a request.`] : []),
      `The subject is ${analysis.themes.some(theme => theme.theme === 'participants') ? 'participants' : 'facilitators'}. This wording does not evaluate the program’s quality or effectiveness, so its sentiment is Neutral.`,
      'Program relevance is Low. The request is not directly actionable as a program improvement; it does not justify appearance-based selection or an official program recommendation.',
    ]
  }
  const reasons = [analysis.label === 'neutral' ? 'The comment states a preference without evaluating current program quality, so its sentiment is Neutral.' : source === 'semantic'
    ? 'The multilingual model found similarity to sentiment reference examples. Similarity is not a calibrated probability and provides no word-level evidence.'
    : analysis.matchedTerms.length ? `Language rules found ${analysis.label === 'mixed' ? 'both positive and negative' : analysis.label} signals, accounting for negation and emphasis.`
      : 'Sentiment is Uncertain because there is insufficient evaluative evidence. A request alone does not establish praise or dissatisfaction.']
  if (analysis.themes.length) reasons.push(`Detected subjects: ${analysis.themes.map(theme => theme.theme).join(', ')}. Topic matching is independent of sentiment.`)
  else reasons.push('No reliable feedback subject was identified.')
  if (context) {
    context.evidence.filter(item => item.kind === 'request' && text.includes(item.phrase)).forEach(item => reasons.push(`“${item.phrase}” indicates a request; a request is treated as a program suggestion only when a program-related subject is supported.`))
    context.evidence.filter(item => item.kind === 'preference' && text.includes(item.phrase)).forEach(item => reasons.push(`“${item.phrase}” expresses an appearance preference; this does not justify appearance-based selection.`))
    reasons.push(`Program relevance: ${context.relevance}. ${context.actionability === 'actionable' ? 'A program-related issue or proposed change is present; staff should verify the original wording before acting.' : context.actionability === 'not-directly-actionable' ? 'No direct program improvement is established by this comment.' : 'Actionability needs manual review; the text does not establish a sufficiently clear program improvement.'}`)
  }
  // Original text remains available alongside these reasons; never paraphrase it as model evidence.
  return reasons
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
      if (analysis.context?.personalPreferenceOnly) return
      const context = hasPhrase(feedbackTokensOf(comments[index]), lexicon.feedbackContext)
      if (!context && !analysis.themes.length && !analysis.matchedTerms.length) return
      const semanticSentiment = classifySemanticSentiment(vector, prototypeVectors.sentiments, thresholds.sentimentMargin)
      if (analysis.label === 'no-signal' && !analysis.isSuggestion && !analysis.context?.intents.some(intent => intent === 'request' || intent === 'personal-preference') && semanticSentiment) {
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
      analyses[index] = withFeedbackContext(comments[index], analysis)
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
