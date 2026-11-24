import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { recordAttendanceForSubmittedEvaluation, submitEvaluation } from '../../features/evaluations/evaluationService'
import { useSearchParams } from 'react-router-dom'
import { fetchMyRegistrations } from '../../features/public/registrationService'
import { Check, HeartHandshake } from 'lucide-react'
import { ASSESSMENT_VERSION, ASSESSMENT_OPTIONS, ASSESSMENT_QUESTIONS, ASSESSMENT_SUGGESTIONS, FACILITATOR_LABEL, MAX_FEEDBACK_LENGTH, EDITABLE_FEEDBACK_FORMAT, assessmentAverage, assessmentScore, assessmentValidation, assessmentSuggestionsInText, toggleAssessmentSuggestion, assessmentFeedback } from '../../features/evaluations/organizationEvaluation'

function SubmitEvaluation({ markAttendedOnSubmit = false }: { markAttendedOnSubmit?: boolean }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activityId } = useParams()
  const requestedRefCode = searchParams.get('ref')?.trim() || ''
  const [refCode, setRefCode] = useState(requestedRefCode)
  const [entryState, setEntryState] = useState<'checking' | 'not-registered' | 'not-attended' | 'event-not-finished' | 'ready' | 'evaluated' | 'evaluation-needs-attendance' | 'error'>(activityId || requestedRefCode ? 'checking' : 'error')
  const [entryMessage, setEntryMessage] = useState(activityId || requestedRefCode ? '' : 'Open an eligible activity from My Evaluations to submit its evaluation.')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [recordingAttendance, setRecordingAttendance] = useState(false)

  const submitLock = useRef(false)
  const [clockNow, setClockNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!activityId && !requestedRefCode) return
    let active = true
    fetchMyRegistrations().then((result) => {
      if (!active) return
      if (!result.ok) { setEntryState('error'); setEntryMessage('We could not check your registration. Please try again.'); return }
      const registration = result.data.find((item) => activityId
        ? item.activityId === activityId
        : item.refCode.toUpperCase() === requestedRefCode.toUpperCase())
      if (!registration || registration.status === 'inactive') { setEntryState('not-registered'); return }
      if (registration.status === 'absent') { setEntryState('error'); setEntryMessage('Attendance has been finalized. You were marked Absent for this activity.'); return }
      if (registration.activityStatus === 'closed') { setEntryState('error'); setEntryMessage('This activity was manually closed. Evaluation and check-in are unavailable.'); return }
      setRefCode(registration.refCode)
      if (registration.hasEvaluation) {
        setEntryState(markAttendedOnSubmit && !registration.hasAttended ? 'evaluation-needs-attendance' : 'evaluated')
        return
      }
      if (!registration.hasAttended && !markAttendedOnSubmit) { setEntryState('not-attended'); return }
      if (registration.activityStatus !== 'completed' && (!markAttendedOnSubmit || !registration.checkInOpensAt || clockNow < new Date(registration.checkInOpensAt).getTime())) {
        setEntryMessage(markAttendedOnSubmit && registration.checkInOpensAt
          ? 'Evaluation and attendance open on ' + new Date(registration.checkInOpensAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) + '. Please scan the QR when your facilitator displays it.'
          : 'Evaluation opens after the activity has ended.')
        setEntryState('event-not-finished'); return
      }
      setEntryState('ready')
    })
    return () => { active = false }
  }, [activityId, requestedRefCode, markAttendedOnSubmit, clockNow])

  async function handleRecordAttendance() {
    if (!refCode || recordingAttendance) return
    setRecordingAttendance(true)
    const result = await recordAttendanceForSubmittedEvaluation(refCode)
    setRecordingAttendance(false)
    if (!result.ok) {
      setEntryMessage(result.error || 'Could not record attendance. Please try again or contact the activity organizer.')
      setEntryState('error')
      return
    }
    setDone(true)
  }

  const selectedSuggestions = assessmentSuggestionsInText(feedback)
  const responseAnswers = { ...answers, feedback_format: EDITABLE_FEEDBACK_FORMAT, selected_suggestions: JSON.stringify(selectedSuggestions.map(suggestion => suggestion.id)) }
  const combinedFeedback = assessmentFeedback(responseAnswers, feedback)
  const filledCount = Number(Boolean(answers.facilitator_name?.trim())) + ASSESSMENT_QUESTIONS.filter(question => assessmentScore(answers[question.key]) !== null).length + Number(Boolean(combinedFeedback))
  const totalQuestions = ASSESSMENT_QUESTIONS.length + 2
  const progressPct = Math.round((filledCount / totalQuestions) * 100)

  function setAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  function moveToNextQuestion(event: MouseEvent<HTMLInputElement>) {
    // Keyboard/assistive clicks have detail 0. Keep normal radio-key navigation
    // in the current question; only a mouse click or tap advances the viewport.
    if (event.detail === 0) return
    const nextQuestion = event.currentTarget.closest('fieldset')?.nextElementSibling as HTMLElement | null
    const target = nextQuestion ?? document.getElementById('evaluation-comments')
    target?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    })
  }

  function toggleSuggestion(id: string) {
    const result = toggleAssessmentSuggestion(feedback, id)
    setError(result.error || '')
    setFeedback(result.text)
  }

  async function handleSubmit() {
    if (submitLock.current) return
    setError('')
    if (!refCode) return setError('Invalid evaluation link.')
    const validationError = assessmentValidation(responseAnswers, feedback)
    if (validationError) return setError(validationError)
    const average = assessmentAverage(answers)!
    submitLock.current = true
    setSubmitting(true)
    try {
      const result = await submitEvaluation({
        refCode,
        // The existing RPC accepts an integer. Exact results remain in responses
        // and all current summaries calculate the unrounded seven-question mean.
        rating: Math.round(average),
        feedback: combinedFeedback,
        wouldRecommend: false,
        responses: { ...responseAnswers, facilitator_name: answers.facilitator_name.trim(), form_version: ASSESSMENT_VERSION, written_comment: combinedFeedback },
        markAttendedOnSubmit,
      })
      if (!result.ok) {
        setError(result.error?.toLowerCase().includes('duplicate') || result.error?.toLowerCase().includes('unique') ? 'An evaluation has already been submitted for this registration. Thank you for your feedback.' : result.error || 'Failed to submit feedback.')
        return
      }
      setDone(true)
    } catch {
      setError('Could not submit your evaluation. Check your connection and try again.')
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 max-w-md w-full text-center">
          <HeartHandshake size={48} className="mx-auto mb-3 text-primary" />
          <h1 className="text-xl font-bold text-gray-900 mb-1">Thank You!</h1>
          <p className="text-sm text-gray-500 mb-6">{markAttendedOnSubmit ? 'Your evaluation was submitted and your attendance has been recorded.' : 'Your feedback helps CYDO improve future activities for Panabo City youth.'}</p>
          <button onClick={() => navigate('/')} className="w-full bg-primary text-white font-medium py-2.5 rounded-lg">
            Back to Activities
          </button>
        </div>
      </div>
    )
  }

  if (entryState !== 'ready') {
    const message = entryState === 'checking' ? 'Checking your activity registration…'
      : entryState === 'not-registered' ? "You're not registered for this activity. Please register before submitting an evaluation."
      : entryState === 'not-attended' ? 'Evaluation opens after your attendance is recorded.'
      : entryState === 'event-not-finished' ? entryMessage || 'Evaluation opens near the end of the activity.'
      : entryState === 'evaluated' ? 'Thank you! Your evaluation has already been submitted.'
      : entryState === 'evaluation-needs-attendance' ? 'Your evaluation is already submitted. Record your attendance below to complete check-in.'
      : entryMessage
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4"><div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center"><HeartHandshake size={48} className="mx-auto mb-3 text-primary" /><h1 className="text-xl font-bold text-gray-900 mb-2">{entryState === 'evaluated' ? 'Thank You!' : 'Activity Evaluation'}</h1><p className="text-sm text-gray-600">{message}</p>{entryState === 'evaluation-needs-attendance' && <button onClick={handleRecordAttendance} disabled={recordingAttendance} className="mt-5 w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-white disabled:opacity-60">{recordingAttendance ? 'Recording attendance…' : 'Record My Attendance'}</button>}</div></div>
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-primary text-white py-6 px-4 text-center sticky top-0 z-10">
        <h1 className="font-bold">Activity Evaluation</h1>
        <div className="max-w-md mx-auto mt-3">
          <div className="flex justify-between text-xs text-green-100 mb-1">
            <span>{filledCount} of {totalQuestions} answered</span>
            <span>{progressPct}% complete</span>
          </div>
          <div className="w-full bg-green-800 rounded-full h-1.5">
            <div className="bg-white h-1.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

    <div className="max-w-3xl mx-auto p-4 space-y-6">

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6" aria-labelledby="assessment-heading">
          <h2 id="assessment-heading" className="text-lg font-bold text-gray-900">Training assessment</h2>
          <p className="mt-1 text-sm text-gray-500">Share your experience with the training. All questions are required.</p>
          <div className="mt-6">
            <label htmlFor="facilitator-name" className="mb-2 block text-sm font-medium text-gray-800">{FACILITATOR_LABEL} <span aria-hidden="true" className="text-red-600">*</span></label>
            <input id="facilitator-name" name="facilitator_name" required maxLength={300} autoComplete="off" value={answers.facilitator_name || ''} onChange={event => setAnswer('facilitator_name', event.target.value)} placeholder="Enter the name or names" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6" aria-labelledby="ratings-heading">
          <h2 id="ratings-heading" className="font-bold text-gray-900">Your assessment</h2>
          <p className="mt-1 text-sm text-gray-500">Choose one rating for each question, from Poor to Excellent. Click or tap an answer to move to the next question.</p>
          <div className="mt-6 divide-y divide-gray-100">
            {ASSESSMENT_QUESTIONS.map((question, index) => <fieldset key={question.key} className="min-w-0 scroll-mt-36 py-5 first:pt-0 last:pb-0">
              <legend className="float-left mb-3 w-full text-sm font-medium leading-relaxed text-gray-800"><span aria-hidden="true" className="mr-2 text-gray-400">{index + 1}.</span>{question.label} <span aria-hidden="true" className="text-red-600">*</span></legend>
              <div className="clear-both grid grid-cols-5 gap-1.5 sm:gap-3">
                {ASSESSMENT_OPTIONS.map(option => <label key={option} className="relative min-w-0 cursor-pointer">
                  <input type="radio" name={question.key} value={option} required checked={answers[question.key] === option} onChange={() => setAnswer(question.key, option)} onClick={moveToNextQuestion} className="peer sr-only" />
                  <span className="flex min-h-16 h-full flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-1 py-2 text-center text-[11px] font-medium leading-tight text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50/50 peer-checked:border-primary peer-checked:bg-primary-light peer-checked:text-primary peer-checked:font-bold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary sm:text-sm">
                    <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border ${answers[question.key] === option ? 'border-primary bg-primary' : 'border-gray-300'}`}>{answers[question.key] === option && <Check size={10} className="text-white" />}</span>
                    {option}
                  </span>
                </label>)}
              </div>
            </fieldset>)}
          </div>
        </section>

        <section id="evaluation-comments" className="scroll-mt-36 bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <h2 className="font-bold text-gray-900">Comments / Suggestions <span aria-hidden="true" className="text-red-600">*</span></h2>
          <p id="suggestions-help" className="mt-1 text-sm leading-relaxed text-gray-500">Select suggestions to add them to your comment below. You can choose several and add your own thoughts.</p>
          <fieldset className="mt-5" aria-describedby="suggestions-help">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suggestions · select all that apply</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {ASSESSMENT_SUGGESTIONS.map(suggestion => {
                const selected = selectedSuggestions.some(item => item.id === suggestion.id)
                return <button key={suggestion.id} type="button" role="checkbox" aria-checked={selected} onClick={() => toggleSuggestion(suggestion.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm ${selected ? 'border-primary bg-primary-light text-primary' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50/50'}`}>
                  <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-primary bg-primary' : 'border-gray-300'}`}>{selected && <Check size={12} className="text-white" />}</span>{suggestion.label}
                </button>
              })}
            </div>
            <p aria-live="polite" className="mt-3 text-xs text-gray-500">{selectedSuggestions.length ? `${selectedSuggestions.length} selected · click again to remove` : 'Optional choices — nothing is selected for you.'}</p>
          </fieldset>
          <div className="mt-6 border-t border-gray-100 pt-5">
            <label htmlFor="assessment-comments" className="block text-sm font-semibold text-gray-800">Your comment</label>
            <p id="comments-help" className="mt-1 mb-3 text-xs leading-relaxed text-gray-500">Selected suggestions appear here. Keep writing, edit any sentence, or remove text before submitting.</p>
            <textarea id="assessment-comments" name="feedback" required aria-describedby="comments-help comments-count" rows={6} maxLength={MAX_FEEDBACK_LENGTH} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Share your experience or add your own suggestion…" className="w-full min-h-36 rounded-xl border border-gray-200 px-4 py-3 text-base placeholder:text-gray-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 resize-y" />
            <p id="comments-count" className="mt-2 text-right text-xs text-gray-400">{feedback.length}/{MAX_FEEDBACK_LENGTH} characters</p>
          </div>
        </section>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <p className="text-center text-xs text-gray-400">Your response helps CYDO improve future activities.</p>
      </div>

      {/* Sticky submit bar */}
      <div className="sticky bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-100 p-4 mt-6">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-primary text-white font-semibold py-3.5 text-base rounded-xl disabled:opacity-50 shadow-sm active:scale-[0.99] transition-transform"
          >
            {submitting ? 'Submitting…' : 'Submit Evaluation'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SubmitEvaluation
