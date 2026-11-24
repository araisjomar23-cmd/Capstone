import { useEffect, useMemo, useState } from 'react'
import { analyzeFeedback, analyzeFeedbackHybrid, type FeedbackAnalysis, type HybridFeedbackBatch } from './feedbackAnalyzer'
import { analyzeOverallEvaluation } from './evaluationAnalysis'
import type { EvaluationRow } from './evaluationService'
import OverallEvaluationSummary from './OverallEvaluationSummary'
import FeedbackComment from '../reports/FeedbackComment'
import { recordedAssessmentSuggestions } from './organizationEvaluation'

export default function EvaluationAnalysisDetails({ evaluation, enabled }: { evaluation: EvaluationRow; enabled: boolean }) {
  const text = evaluation.feedback || ''
  const rules = useMemo(() => enabled ? analyzeFeedback(text) : null, [enabled, text])
  const [resolved, setResolved] = useState<{ text: string; analysis: FeedbackAnalysis; source: HybridFeedbackBatch['sentimentSources'][number] } | null>(null)
  useEffect(() => {
    if (!enabled || !text.trim()) return
    let active = true
    void analyzeFeedbackHybrid([text]).then(batch => {
      if (active) setResolved({ text, analysis: batch.analyses[0], source: batch.sentimentSources[0] })
    })
    return () => { active = false }
  }, [enabled, text])
  if (!enabled || !rules) return null
  const current = resolved?.text === text ? resolved : { analysis: rules, source: rules.label === 'no-signal' ? 'none' as const : 'rules' as const }
  const overall = analyzeOverallEvaluation(evaluation, current.analysis)
  return <section aria-label="Full evaluation analysis" className="space-y-4">
    <h3 className="text-sm font-bold text-primary">Full Evaluation Analysis</h3>
    <div><h4 className="mb-2 text-xs font-bold text-slate-700">NLP Comment Analysis</h4>{text.trim() ? <FeedbackComment comment={{ id: evaluation.id, activityTitle: evaluation.activityTitle, submittedAt: evaluation.submittedAt, text, quickSuggestionCount: recordedAssessmentSuggestions(evaluation.responses, text).length, sentiment: current.analysis.label, isSuggestion: current.analysis.isSuggestion, context: current.analysis.context, themes: current.analysis.themes.map(theme => theme.theme), sentimentSource: current.source, matchedTerms: current.analysis.matchedTerms, themeDetails: current.analysis.themes }} /> : <p className="text-sm text-slate-500">No written comment was recorded. Structured evaluation answers are summarized below.</p>}</div>
    <OverallEvaluationSummary analysis={overall} showEvidence={false} />
  </section>
}
