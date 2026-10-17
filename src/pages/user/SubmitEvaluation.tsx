import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { submitEvaluation } from '../../features/evaluations/evaluationService'
import { useSearchParams } from 'react-router-dom'
import { HeartHandshake } from 'lucide-react'
import { Star } from 'lucide-react'

const VALUABLE_OPTIONS = ['Knowledge and skills gained', 'Networking with other youth', "Facilitator's expertise", 'Activities and exercises', 'Overall program experience']
const IMPROVE_OPTIONS = ['Time management', 'Venue and facilities', 'Activity content', 'Food and refreshments', 'Communication and announcements']
const LEARNING_OPTIONS = ['New knowledge and information', 'Practical skills', 'Inspiration and motivation', 'New connections and friends', 'Awareness of youth programs']
const ATTEND_AGAIN_OPTIONS = ['Definitely yes', 'Probably yes', 'Not sure', 'Probably not']
const PARTICIPATION_OPTIONS = ['Active participant in all sessions', 'Mostly listened and observed', 'Participated in some parts only', 'Volunteer or committee member']
const TIME_MGMT_OPTIONS = ['Excellent — ran on schedule', 'Good — minor delays only', 'Fair — noticeable delays', 'Poor — significant delays']

const LIKERT_QUESTIONS = [
  { key: 'q1', label: 'The activity objectives were clearly communicated.' },
  { key: 'q2', label: 'The content was relevant to my needs and interests.' },
  { key: 'q3', label: 'The activity was well-organized and ran smoothly.' },
  { key: 'q4', label: 'I would recommend this activity to fellow youth.' },
]
const LIKERT_LABELS: Record<string, string> = { '1': 'Strongly Disagree', '2': 'Disagree', '3': 'Neutral', '4': 'Agree', '5': 'Strongly Agree' }

const COMMON_COMMENTS = [
  'The activity was well-organized and very informative.',
  'I learned a lot and gained new skills from the facilitators.',
  'I hope more activities like this are organized in the future.',
  'The venue was comfortable and easily accessible.',
  'The sessions felt too short — more time would have been better.',
  'I would love more interactive and hands-on activities next time.',
]

const REQUIRED_KEYS = ['fb_valuable', 'fb_improve', 'fb_learning', 'fb_attend_again', 'fb_participation', 'fb_time_mgmt', 'q1', 'q2', 'q3', 'q4', 'overall_star']

function RadioGroup({ name, options, value, onChange }: { name: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label
          key={opt}
          className={`block border rounded-lg px-3 py-2.5 text-sm cursor-pointer ${
            value === opt ? 'border-primary bg-green-50 text-primary font-medium' : 'border-gray-200 text-gray-600'
          }`}
        >
          <input type="radio" name={name} value={opt} checked={value === opt} onChange={() => onChange(opt)} className="mr-2" />
          {opt}
        </label>
      ))}
    </div>
  )
}

function LikertRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-800 mb-2">{label}</div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {['1', '2', '3', '4', '5'].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`text-center py-3 rounded-lg text-base font-bold border ${
              value === n ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
        <span>Strongly Disagree</span>
        <span>Strongly Agree</span>
      </div>
      {value && (
        <div className="text-center text-xs font-medium text-primary mt-1.5">
          {LIKERT_LABELS[value]}
        </div>
      )}
    </div>
  )
}

function SubmitEvaluation() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const refCode = searchParams.get('ref') || ''
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const filledCount = REQUIRED_KEYS.filter((k) => answers[k]).length
  const progressPct = Math.round((filledCount / REQUIRED_KEYS.length) * 100)

  function setAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  function toggleChip(text: string) {
    setFeedback((prev) => (prev.includes(text) ? prev.replace(text, '').trim() : (prev ? prev + ' ' : '') + text))
  }

  async function handleSubmit() {
    setError('')
    if (!refCode) {return setError('Invalid evaluation link.')}
    const missing = REQUIRED_KEYS.filter((k) => !answers[k])
    if (missing.length > 0) return setError('Please answer all required questions before submitting.')

    setSubmitting(true)
    const result = await submitEvaluation({
      refCode,
      rating: Number(answers.overall_star),
      feedback: feedback.trim(),
      wouldRecommend: Number(answers.q4) >= 4,
      responses: answers,
    })
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error || 'Failed to submit feedback.')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 max-w-md w-full text-center">
          <HeartHandshake size={48} className="mx-auto mb-3 text-primary" />
          <h1 className="text-xl font-bold text-gray-900 mb-1">Thank You!</h1>
          <p className="text-sm text-gray-500 mb-6">Your feedback helps CYDO improve future activities for Panabo City youth.</p>
          <button onClick={() => navigate('/')} className="w-full bg-primary text-white font-medium py-2.5 rounded-lg">
            Back to Activities
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-primary text-white py-6 px-4 text-center sticky top-0 z-10">
        <h1 className="font-bold">Activity Evaluation</h1>
        <div className="max-w-md mx-auto mt-3">
          <div className="flex justify-between text-xs text-green-100 mb-1">
            <span>Progress</span>
            <span>{progressPct}% complete</span>
          </div>
          <div className="w-full bg-green-800 rounded-full h-1.5">
            <div className="bg-white h-1.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

    <div className="max-w-3xl mx-auto p-4 space-y-6">

        {/* Section 1 */}
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 sm:p-5">
          <h2 className="font-bold text-gray-900 mb-1">Participant Feedback</h2>
          <p className="text-xs text-gray-400 mb-4">Section 1 of 4</p>

          <div className="space-y-5">
            <div>
              <div className="text-sm font-medium text-gray-800 mb-2">What was the most valuable aspect of this activity? *</div>
              <RadioGroup name="fb_valuable" options={VALUABLE_OPTIONS} value={answers.fb_valuable || ''} onChange={(v) => setAnswer('fb_valuable', v)} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800 mb-2">Which area needs the most improvement? *</div>
              <RadioGroup name="fb_improve" options={IMPROVE_OPTIONS} value={answers.fb_improve || ''} onChange={(v) => setAnswer('fb_improve', v)} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800 mb-2">What did you primarily gain from this activity? *</div>
              <RadioGroup name="fb_learning" options={LEARNING_OPTIONS} value={answers.fb_learning || ''} onChange={(v) => setAnswer('fb_learning', v)} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800 mb-2">Would you attend a similar activity in the future? *</div>
              <RadioGroup name="fb_attend_again" options={ATTEND_AGAIN_OPTIONS} value={answers.fb_attend_again || ''} onChange={(v) => setAnswer('fb_attend_again', v)} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800 mb-2">How did you participate in this activity? *</div>
              <RadioGroup name="fb_participation" options={PARTICIPATION_OPTIONS} value={answers.fb_participation || ''} onChange={(v) => setAnswer('fb_participation', v)} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800 mb-2">How was the time management of the activity? *</div>
              <RadioGroup name="fb_time_mgmt" options={TIME_MGMT_OPTIONS} value={answers.fb_time_mgmt || ''} onChange={(v) => setAnswer('fb_time_mgmt', v)} />
            </div>
          </div>
        </div>

        {/* Section 2 */}
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 sm:p-5">
          <h2 className="font-bold text-gray-900 mb-1">Activity Assessment</h2>
          <p className="text-xs text-gray-400 mb-4">Section 2 of 4 · Rate 1 (Strongly Disagree) to 5 (Strongly Agree)</p>
          <div className="space-y-6">
            {LIKERT_QUESTIONS.map((q) => (
              <LikertRow key={q.key} label={q.label} value={answers[q.key] || ''} onChange={(v) => setAnswer(q.key, v)} />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 sm:p-5">
          <h2 className="font-bold text-gray-900 mb-1">Overall Rating</h2>
          <p className="text-xs text-gray-400 mb-4">Section 3 of 4</p>
         <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAnswer('overall_star', String(n))}>
                <Star
                  size={36}
                  className={n <= Number(answers.overall_star || 0) ? 'fill-amber-500 text-amber-500' : 'fill-gray-200 text-gray-200'}/>
              </button>
            ))}
          </div>
          <div className="text-center text-xs text-gray-400 mt-2">
            {answers.overall_star ? `${LIKERT_LABELS[answers.overall_star] || ''} — ${answers.overall_star} out of 5` : 'Tap a star to rate'}
          </div>
        </div>

        {/* Section 4 */}
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 sm:p-5">
          <h2 className="font-bold text-gray-900 mb-1">Comments & Suggestions</h2>
          <p className="text-xs text-gray-400 mb-4">Section 4 of 4</p>

          <div className="text-xs font-semibold text-gray-500 mb-2">Quick add a comment:</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {COMMON_COMMENTS.map((c) => {
              const active = feedback.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChip(c)}
                  className={`inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full border transition-colors ${
                    active
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 active:bg-gray-50'
                  }`}
                >
                  <span className={`flex items-center justify-center w-4 h-4 rounded-full border shrink-0 ${
                    active ? 'bg-white border-white' : 'border-gray-300'
                  }`}>
                    {active && <span className="text-primary text-[10px] leading-none">✓</span>}
                  </span>
                  {c}
                </button>
              )
            })}
          </div>

          <textarea
            rows={4}
            maxLength={600}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Write your own comment and suggestions"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base placeholder:text-gray-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-shadow resize-none"
          />
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 bg-gray-100 rounded-full h-1">
              <div
                className={`h-1 rounded-full transition-all ${
                  feedback.length > 550 ? 'bg-red-400' : feedback.length > 400 ? 'bg-amber-400' : 'bg-primary'
                }`}
                style={{ width: `${(feedback.length / 600) * 100}%` }}
              />
            </div>
            <span className={`text-[11px] shrink-0 ${feedback.length > 550 ? 'text-red-500 font-medium' : 'text-gray-300'}`}>
              {feedback.length}/600
            </span>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 text-center">⚠️ {error}</p>}

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