import type { ReportData } from './reportService'

type Comment = ReportData['feedbackAnalysis']['comments'][number]

function sentimentLabel(value: Comment['sentiment']) {
  return value === 'no-signal' ? 'Needs review' : value.charAt(0).toUpperCase() + value.slice(1)
}

export default function FeedbackComment({ comment }: { comment: Comment }) {
  return (
    <article className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="break-words text-sm font-medium text-gray-900">{comment.activityTitle}</h5>
          <p className="mt-1 text-xs text-gray-500">{new Date(comment.submittedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${comment.sentiment === 'positive' ? 'bg-green-50 text-green-700' : comment.sentiment === 'negative' ? 'bg-red-50 text-red-700' : comment.sentiment === 'mixed' ? 'bg-amber-50 text-amber-700' : 'bg-gray-200 text-gray-600'}`}>
          {sentimentLabel(comment.sentiment)}
        </span>
      </div>
      <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-2 border-gray-300 pl-3 text-sm text-gray-700">{comment.text}</blockquote>
      {comment.isSuggestion && <p className="mt-3 w-fit rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Suggestion</p>}
      {comment.themes.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{comment.themes.map(theme => <span key={theme} className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold capitalize text-gray-500">{theme}</span>)}</div>}
      <details className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-600"><summary className="w-fit cursor-pointer py-2 font-semibold text-primary">View analysis & matched wording</summary><div className="mt-1 space-y-2 pb-1">
        <p><strong>How NLP reached this result: </strong>
          {comment.sentimentSource === 'rules' ? 'Matched language rules, including negation and emphasis.'
            : comment.sentimentSource === 'semantic' ? 'The multilingual model found a similar meaning to sentiment examples.'
              : 'No clear sentiment was identified. Review this comment manually; it is not automatically positive or negative.'}
        </p>
        {comment.matchedTerms.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">Matched wording:</span>
            {comment.matchedTerms.map((term, index) => (
              <span key={`${term.term}-${index}`} className={`max-w-full break-words rounded border px-2 py-1 ${term.sentiment === 'positive' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                {term.term} → {term.sentiment}{term.negated ? ' (negated)' : ''}
              </span>
            ))}
          </div>
        )}
        {comment.themeDetails.length > 0 ? (
          <ul className="space-y-1">
            {comment.themeDetails.map((theme) => (
              <li key={theme.theme} className="break-words"><strong className="capitalize">{theme.theme}: </strong>
                {theme.sentiment === 'no-signal' ? 'Topic detected; sentiment unclear' : sentimentLabel(theme.sentiment)}
                {theme.matchedTerms.includes('multilingual semantic similarity') ? ' — identified by the multilingual model' : ` — matched: ${theme.matchedTerms.join(', ')}`}
              </li>
            ))}
          </ul>
        ) : <p>No specific feedback topic was identified.</p>}
      </div></details>
    </article>
  )
}
