import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { EvaluationRow } from './evaluationService'
import EvaluationAnalysisDetails from './EvaluationAnalysisDetails'
import { ASSESSMENT_QUESTIONS, FACILITATOR_LABEL, EDITABLE_FEEDBACK_FORMAT, isOrganizationAssessment, assessmentAverage, recordedAssessmentSuggestions } from './organizationEvaluation'
import FeedbackSuggestionNote from './FeedbackSuggestionNote'

const SECTIONS = [
  {
    title: 'Participant Feedback',
    questions: [
      ['fb_valuable', 'What was the most valuable aspect of this activity?'],
      ['fb_improve', 'Which area needs the most improvement?'],
      ['fb_learning', 'What did you primarily gain from this activity?'],
      ['fb_attend_again', 'Would you attend a similar activity in the future?'],
      ['fb_participation', 'How did you participate in this activity?'],
      ['fb_time_mgmt', 'How was the time management of the activity?'],
    ],
  },
  {
    title: 'Activity Assessment',
    questions: [
      ['q1', 'The activity objectives were clearly communicated.'],
      ['q2', 'The content was relevant to my needs and interests.'],
      ['q3', 'The activity was well-organized and ran smoothly.'],
      ['q4', 'I would recommend this activity to fellow youth.'],
    ],
  },
]

const LIKERT_LABELS: Record<string, string> = {
  '1': 'Strongly Disagree', '2': 'Disagree', '3': 'Neutral', '4': 'Agree', '5': 'Strongly Agree',
}
const KNOWN_KEYS = new Set([...SECTIONS.flatMap((section) => section.questions.map(([key]) => key)), 'overall_star'])

export default function EvaluationResponseDetails({ evaluation }: { evaluation: EvaluationRow }) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const responses = evaluation.responses
  const organizationForm = isOrganizationAssessment(responses)
  const sections = organizationForm ? [
    { title: 'Facilitator / Trainer / Speaker', questions: [['facilitator_name', FACILITATOR_LABEL]] },
    { title: 'Training Assessment', questions: ASSESSMENT_QUESTIONS.map(question => [question.key, question.label]) },
  ] : SECTIONS
  const knownKeys = organizationForm ? new Set(['form_version', 'feedback_format', 'selected_suggestions', 'written_comment', ...sections.flatMap(section => section.questions.map(([key]) => key))]) : KNOWN_KEYS
  const additionalAnswers = Object.entries(responses).filter(([key]) => !knownKeys.has(key))
  const average = organizationForm ? assessmentAverage(responses) : null
  const suggestions = recordedAssessmentSuggestions(responses, evaluation.feedback)
  const editableComment = responses.feedback_format === EDITABLE_FEEDBACK_FORMAT
  const writtenComment = organizationForm && !editableComment && Object.hasOwn(responses, 'written_comment') ? responses.written_comment : evaluation.feedback

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="mt-3 min-h-11 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-primary hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-primary">
        View full response<span className="sr-only"> from {evaluation.participantName} for {evaluation.activityTitle}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        onClose={() => setOpen(false)}
        onCancel={(event) => { event.preventDefault(); setOpen(false) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return
          const bounds = event.currentTarget.getBoundingClientRect()
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false)
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white p-4 sm:p-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-primary">Full Evaluation Response</h2>
            <p className="mt-1 break-words text-sm font-semibold">{evaluation.participantName}</p>
            <p className="break-words text-sm text-gray-500">{evaluation.activityTitle}</p>
            <p className="mt-1 text-xs text-gray-500">Submitted {new Date(evaluation.submittedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close full response" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-primary">
            <X size={20} />
          </button>
        </div>
      <div className="space-y-5 p-4 sm:p-6">
        <EvaluationAnalysisDetails evaluation={evaluation} enabled={open} />
        {Object.keys(responses).length === 0 && (
          <p className="text-sm text-gray-500">Detailed form answers were not saved for this evaluation. The overall rating and any comments are shown below.</p>
        )}
        {sections.map((section) => (
          <section key={section.title}>
            <h3 className="mb-3 text-sm font-bold text-gray-900">{section.title}</h3>
            <dl className="space-y-3">
              {section.questions.map(([key, label]) => {
                const answer = responses[key]
                const display = section.title === 'Activity Assessment' && LIKERT_LABELS[answer]
                  ? `${answer} / 5 — ${LIKERT_LABELS[answer]}` : answer
                return (
                  <div key={key} className="min-w-0">
                    <dt className="text-sm text-gray-500">{label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-gray-900">{display || 'Not recorded'}</dd>
                  </div>
                )
              })}
            </dl>
          </section>
        ))}
        <section>
          <h3 className="text-sm font-bold text-gray-900">{organizationForm ? 'Assessment Average' : 'Overall Rating'}</h3>
          <p className="mt-1 text-sm text-gray-700">{organizationForm ? average === null ? 'Unavailable — incomplete ratings' : `${average.toFixed(1)} / 5 · calculated from seven ratings` : `${responses.overall_star || evaluation.rating} / 5 stars`}</p>
        </section>
        <section>
          <h3 className="text-sm font-bold text-gray-900">Comments / Suggestions</h3>
          {editableComment ? <FeedbackSuggestionNote count={suggestions.length} /> : suggestions.length > 0 && <div className="mt-3"><h4 className="text-xs font-semibold text-gray-500">Selected suggestions</h4><ul className="mt-2 space-y-1 text-sm text-gray-700">{suggestions.map(suggestion => <li key={suggestion.id}>{suggestion.text}</li>)}</ul></div>}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700">{writtenComment || (suggestions.length ? 'No additional written comment.' : 'No comments provided.')}</p>
        </section>
        {additionalAnswers.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-bold text-gray-900">Additional Answers</h3>
            <dl className="space-y-3">
              {additionalAnswers.map(([key, answer]) => (
                <div key={key} className="min-w-0">
                  <dt className="break-words text-sm text-gray-500">{key}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">{answer || 'Not recorded'}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
      </dialog>
    </>
  )
}
