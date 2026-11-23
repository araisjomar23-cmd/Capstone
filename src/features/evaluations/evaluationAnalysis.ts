import { analyzeFeedback, type FeedbackAnalysis, type SuggestedSentiment } from './feedbackAnalyzer.ts'

export interface EvaluationAnalysisInput {
  rating?: unknown
  responses?: unknown
  feedback?: string
  wouldRecommend?: boolean
}
export interface EvaluationReviewFlag { id: string; title: string; detail: string; responseKeys: string[] }
export interface OverallEvaluationAnalysis {
  rating: number | null
  ratingLabel: string
  ratingSource: 'rating' | 'overall_star' | 'missing'
  criteria: { key: string; label: string; rating: number | null }[]
  answers: { key: string; label: string; answer: string | null }[]
  recommendation: { label: string; tone: 'positive' | 'neutral' | 'negative' | 'unknown' }
  narrative: string[]
  reviewFlags: EvaluationReviewFlag[]
  reviewRecommended: boolean
  recordedAnswers: number
  totalAnswers: number
  commentSentiment: SuggestedSentiment | null
  commentContextNote?: string
}

const CRITERIA = [
  ['q1', 'Clarity of objectives'], ['q2', 'Content relevance'],
  ['q3', 'Organization'], ['q4', 'Recommendation to fellow youth'],
] as const
const ANSWERS = [
  ['fb_valuable', 'Most valuable aspect'], ['fb_improve', 'Improvement area selected'],
  ['fb_learning', 'Primary learning outcome'], ['fb_attend_again', 'Future participation'],
  ['fb_participation', 'Self-reported participation'], ['fb_time_mgmt', 'Time management assessment'],
] as const
const normalize = (text: string) => text.toLowerCase().replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim()

export function recordedEvaluationResponses(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, answer]) => typeof answer === 'string' || typeof answer === 'number').map(([key, answer]) => [key, String(answer)]))
}
function score(value: unknown): number | null {
  return (typeof value === 'number' || typeof value === 'string') && /^[1-5]$/.test(String(value).trim()) ? Number(value) : null
}

export function evaluationRecommendation(input: EvaluationAnalysisInput): OverallEvaluationAnalysis['recommendation'] {
  const rating = score(recordedEvaluationResponses(input.responses).q4)
  if (rating === 3) return { label: 'Neutral recommendation (3/5)', tone: 'neutral' }
  if (rating !== null) return rating > 3 ? { label: 'Would recommend', tone: 'positive' } : { label: 'Would not recommend', tone: 'negative' }
  // A historical false flag does not distinguish Neutral from Disagree.
  return input.wouldRecommend === true ? { label: 'Would recommend', tone: 'positive' } : { label: 'No affirmative recommendation recorded', tone: 'unknown' }
}

/** Structured survey interpretation; never changes the written-comment result or saved scores. */
export function analyzeOverallEvaluation(input: EvaluationAnalysisInput, commentAnalysis?: FeedbackAnalysis): OverallEvaluationAnalysis {
  const responses = recordedEvaluationResponses(input.responses)
  const comment = commentAnalysis ?? analyzeFeedback(input.feedback || '')
  const storedRating = score(input.rating), formRating = score(responses.overall_star)
  const rating = storedRating ?? formRating
  const criteria = CRITERIA.map(([key, label]) => ({ key, label, rating: score(responses[key]) }))
  const answers = ANSWERS.map(([key, label]) => ({ key, label, answer: responses[key]?.trim() || null }))
  const recordedAnswers = answers.filter(item => item.answer !== null).length + criteria.filter(item => item.rating !== null).length
  const reviewFlags: EvaluationReviewFlag[] = []
  const narrative: string[] = []
  const valuable = answers.find(item => item.key === 'fb_valuable')!.answer
  const learning = answers.find(item => item.key === 'fb_learning')!.answer
  const improvement = answers.find(item => item.key === 'fb_improve')!.answer
  const future = answers.find(item => item.key === 'fb_attend_again')!.answer
  const participation = answers.find(item => item.key === 'fb_participation')!.answer
  const timing = answers.find(item => item.key === 'fb_time_mgmt')!.answer
  if (valuable) narrative.push(`The participant selected “${valuable}” as the most valuable aspect${learning ? ` and “${learning}” as the primary learning outcome` : ''}. These describe the participant’s self-reported experience.`)
  else if (learning) narrative.push(`The participant reports “${learning}” as the primary learning outcome.`)
  const ratedCriteria = criteria.filter(item => item.rating !== null)
  if (ratedCriteria.length === 4 && ratedCriteria.every(item => item.rating === 3)) narrative.push('All four assessment criteria were rated Neutral (3/5).')
  else if (ratedCriteria.length) narrative.push(`${ratedCriteria.length} of four assessment criteria have recorded ratings, ranging from ${Math.min(...ratedCriteria.map(item => item.rating!))}/5 to ${Math.max(...ratedCriteria.map(item => item.rating!))}/5.`)
  if (rating !== null) narrative.push(`The overall rating is ${rating}/5${rating === 3 ? ' — Neutral' : rating < 3 ? ' — below the neutral midpoint' : ' — above the neutral midpoint'}. This rating is separate from written-comment sentiment.`)
  if (improvement) narrative.push(`The selected improvement priority is “${improvement}”${timing ? `; the separate time management assessment is “${timing}”` : ''}.`)
  else if (timing) narrative.push(`Time management was assessed as “${timing}”.`)
  if (participation) narrative.push(`Participation was self-reported as “${participation}”; this does not replace recorded attendance.`)
  if (normalize(improvement || '') === 'time management' && /^(excellent|good)\b/.test(normalize(timing || ''))) {
    reviewFlags.push({ id: 'time-management-context', title: 'Time-management responses need context', detail: `“Time management” was selected for improvement, while scheduling was assessed as “${timing}”. These answers are not necessarily contradictory: an activity can run on schedule while needing changes to how time is allocated. Clarify the participant’s concern.`, responseKeys: ['fb_improve', 'fb_time_mgmt'] })
  }
  if (future) narrative.push(`For attending a similar activity again, the participant selected “${future}”.`)
  if (normalize(future || '') === 'probably not') {
    reviewFlags.push({ id: 'future-participation', title: 'Low intention to attend again', detail: 'The participant selected “Probably not”. This is a concern to review, but it does not establish their reason or prove dissatisfaction. Do not assume the written comment explains their reluctance to return.', responseKeys: ['fb_attend_again'] })
  } else if (normalize(future || '') === 'not sure') {
    reviewFlags.push({ id: 'future-participation-uncertain', title: 'Future participation is uncertain', detail: 'The participant selected “Not sure”. Their intention and reasons remain uncertain.', responseKeys: ['fb_attend_again'] })
  }
  if (storedRating !== null && formRating !== null && storedRating !== formRating) {
    reviewFlags.push({ id: 'rating-fields', title: 'Recorded overall ratings differ', detail: `The saved overall rating is ${storedRating}/5, while the form answer is ${formRating}/5. The saved rating is shown; review both values without automatically changing either.`, responseKeys: ['rating', 'overall_star'] })
  }
  if (recordedAnswers < 10) narrative.push(`Detailed survey answers are incomplete (${recordedAnswers}/10 recorded). No missing benefits, ratings or intentions have been inferred.`)
  if (!recordedAnswers && rating === null) narrative.push('There is insufficient structured evaluation information for an overall assessment.')
  if (reviewFlags.length) narrative.push(rating === 3 ? 'These responses suggest a need for further review rather than a definite conclusion about dissatisfaction.' : 'Review the flagged responses in context; the summary does not establish causes that the participant has not provided.')
  const hasComment = Boolean(input.feedback?.trim())
  return {
    rating, ratingLabel: rating === null ? 'Overall rating not recorded' : rating === 3 ? 'Neutral Overall Rating' : rating < 3 ? 'Low Overall Rating' : 'High Overall Rating',
    ratingSource: storedRating !== null ? 'rating' : formRating !== null ? 'overall_star' : 'missing',
    criteria, answers, recommendation: evaluationRecommendation(input), narrative, reviewFlags,
    reviewRecommended: reviewFlags.length > 0, recordedAnswers, totalAnswers: 10,
    commentSentiment: hasComment ? comment.label : null,
    ...(hasComment && comment.context?.requestType === 'personal-preference' ? { commentContextNote: 'The written comment expresses a personal preference. It is not evidence that this preference caused any rating or future-participation answer.' } : {}),
  }
}
