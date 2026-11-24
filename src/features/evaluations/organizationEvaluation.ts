/** Questions 6–14 of the organization's Assessment form. Questions 1–5 are omitted. */
export const ASSESSMENT_VERSION = 'cydo-assessment-v1'
export const ASSESSMENT_OPTIONS = ['Poor', 'Average', 'Good', 'Very Good', 'Excellent'] as const
export const ASSESSMENT_QUESTIONS = [
  { key: 'assessment_content', number: 7, label: 'How was the content covered by this training?', shortLabel: 'Training content' },
  { key: 'assessment_job_support', number: 8, label: 'Will you be able to do your job efficiently by the support of this training?', shortLabel: 'Support for doing your job' },
  { key: 'assessment_technical_knowledge', number: 9, label: 'How was the technical knowledge imparted by the training?', shortLabel: 'Technical knowledge' },
  { key: 'assessment_participation', number: 10, label: 'How was the participation by other co-trainees?', shortLabel: 'Co-trainee participation' },
  { key: 'assessment_methods', number: 11, label: 'How would you rate the training activities and methods used to support learning?', shortLabel: 'Activities and learning methods' },
  { key: 'assessment_relevance', number: 12, label: 'How would you rate the relevance of the training topics to your needs and responsibilities?', shortLabel: 'Relevance to your needs' },
  { key: 'assessment_speaker', number: 13, label: 'How would you rate the speaker/facilitator’s knowledge and delivery of the topics?', shortLabel: 'Speaker knowledge and delivery' },
] as const
export const FACILITATOR_LABEL = 'Name of Facilitator/Trainer/Speaker'
export const MAX_FEEDBACK_LENGTH = 3000
export const EDITABLE_FEEDBACK_FORMAT = 'editable-suggestions-v1'
// Optional, opt-in prompts based on the organization's assessment criteria.
// None is selected for the participant or inferred from a numerical rating.
export const ASSESSMENT_SUGGESTIONS = [
  { id: 'hands-on', label: 'More hands-on activities', text: 'I suggest adding more hands-on activities.' },
  { id: 'examples', label: 'More real-life examples', text: 'Please include more real-life examples.' },
  { id: 'materials', label: 'More learning materials', text: 'Please provide more learning materials.' },
  { id: 'questions', label: 'More time for questions', text: 'Please allow more time for questions and discussion.' },
  { id: 'pace', label: 'A more balanced pace', text: 'Please use a more balanced pace during the sessions.' },
  { id: 'participation', label: 'More group participation', text: 'Please include more opportunities for group participation.' },
  { id: 'relevance', label: 'Topics closer to our needs', text: 'Please include more topics related to our needs and responsibilities.' },
  { id: 'explanations', label: 'Clearer technical explanations', text: 'Please provide clearer explanations of technical topics.' },
] as const

export function selectedAssessmentSuggestions(answers: Record<string, string>) {
  try {
    const ids: unknown = JSON.parse(answers.selected_suggestions || '[]')
    return Array.isArray(ids) ? ASSESSMENT_SUGGESTIONS.filter(suggestion => ids.includes(suggestion.id)) : []
  } catch { return [] }
}

/** Only intact suggestion lines are marked as selected; participant edits remain their own text. */
export function assessmentSuggestionsInText(comment: string) {
  const lines = new Set(comment.split(/\r?\n/).map(line => line.trim()))
  return ASSESSMENT_SUGGESTIONS.filter(suggestion => lines.has(suggestion.text))
}

export function toggleAssessmentSuggestion(comment: string, id: string): { text: string; error: string | null } {
  const suggestion = ASSESSMENT_SUGGESTIONS.find(item => item.id === id)
  if (!suggestion) return { text: comment, error: null }
  if (assessmentSuggestionsInText(comment).some(item => item.id === id)) {
    return { text: comment.split(/\r?\n/).filter(line => line.trim() !== suggestion.text).join('\n'), error: null }
  }
  const text = comment + (comment && !comment.endsWith('\n') ? '\n' : '') + suggestion.text + '\n'
  return text.length <= MAX_FEEDBACK_LENGTH ? { text, error: null }
    : { text: comment, error: 'Please shorten your comment before adding another suggestion. Your comment has been kept.' }
}

/** Read provenance without using stale selections to reinsert edited/deleted wording. */
export function recordedAssessmentSuggestions(responses: unknown, feedback: string) {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return []
  const answers = responses as Record<string, string>
  const selected = selectedAssessmentSuggestions(answers)
  const intact = assessmentSuggestionsInText(feedback)
  return selected.filter(suggestion => answers.feedback_format === EDITABLE_FEEDBACK_FORMAT
    ? intact.some(item => item.id === suggestion.id) : feedback.includes(suggestion.text))
}

/** New forms submit exactly the edited textbox; older separate-comment responses remain supported. */
export function assessmentFeedback(answers: Record<string, string>, comment: string): string {
  if (answers.feedback_format === EDITABLE_FEEDBACK_FORMAT) return comment.trim()
  const suggestions = selectedAssessmentSuggestions(answers).map(suggestion => suggestion.text).join('\n')
  return [suggestions, comment.trim()].filter(Boolean).join('\n\n')
}

export function isOrganizationAssessment(responses: unknown): boolean {
  return !!responses && typeof responses === 'object' && !Array.isArray(responses)
    && (responses as Record<string, unknown>).form_version === ASSESSMENT_VERSION
}

export function assessmentScore(value: unknown): number | null {
  const index = ASSESSMENT_OPTIONS.findIndex(option => option === value)
  return index < 0 ? null : index + 1
}

export function assessmentAverage(responses: Record<string, unknown>): number | null {
  const scores = ASSESSMENT_QUESTIONS.map(question => assessmentScore(responses[question.key]))
  return scores.every((value): value is number => value !== null)
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null
}

/** Read the exact seven-item mean for the new form; keep historical star ratings intact. */
export function evaluationScore(input: { rating?: unknown; responses?: unknown }): number | null {
  if (isOrganizationAssessment(input.responses)) return assessmentAverage(input.responses as Record<string, unknown>)
  const value = input.rating
  return (typeof value === 'number' || typeof value === 'string') && /^[1-5]$/.test(String(value).trim()) ? Number(value) : null
}

export function assessmentValidation(answers: Record<string, string>, feedback: string): string | null {
  const combinedFeedback = assessmentFeedback(answers, feedback)
  if (!answers.facilitator_name?.trim() || ASSESSMENT_QUESTIONS.some(question => assessmentScore(answers[question.key]) === null) || !combinedFeedback) {
    return 'Please answer all required questions before submitting.'
  }
  if (answers.facilitator_name.trim().length > 300) return 'Keep the facilitator name within 300 characters.'
  if (combinedFeedback.length > MAX_FEEDBACK_LENGTH) return `Keep comments and selected suggestions within ${MAX_FEEDBACK_LENGTH} characters.`
  return null
}

/** The organization form does not ask about recommendations. Exclude it from that metric. */
export function recommendationStats(rows: { responses?: unknown; wouldRecommend?: boolean }[]) {
  const eligible = rows.filter(row => !isOrganizationAssessment(row.responses))
  return {
    recommendResponses: eligible.length,
    recommendRate: eligible.length ? Math.round(eligible.filter(row => row.wouldRecommend).length / eligible.length * 100) : 0,
  }
}
