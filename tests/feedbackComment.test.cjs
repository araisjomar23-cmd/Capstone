const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
function load(relative, mocks = {}) {
  const file = path.resolve(relative)
  if (file.endsWith('.json')) return require(file)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (!name.startsWith('.')) return require(name)
    const base = path.resolve(path.dirname(file), name)
    return load([base, base + '.ts', base + '.tsx'].find(candidate => fs.existsSync(candidate)), mocks)
  }, module, module.exports)
  return module.exports
}
const { analyzeFeedback } = load('src/features/evaluations/feedbackAnalyzer.ts')
const FeedbackComment = load('src/features/reports/FeedbackComment.tsx').default
const { analyzeOverallEvaluation } = load('src/features/evaluations/evaluationAnalysis.ts')

test('feedback card preserves original text and displays independent contextual classifications', () => {
  const text = '  I want more pogi participants  '
  const analysis = analyzeFeedback(text)
  const html = renderToStaticMarkup(React.createElement(FeedbackComment, { comment: { id: 'regression', text, activityTitle: 'Youth workshop', submittedAt: '2026-11-23T08:00:00Z', sentiment: analysis.label, isSuggestion: analysis.isSuggestion, context: analysis.context, themes: analysis.themes.map(theme => theme.theme), themeDetails: analysis.themes, matchedTerms: analysis.matchedTerms, sentimentSource: 'rules' } }))
  assert.ok(html.includes(text))
  for (const label of ['Neutral', 'participants', 'Request', 'Personal Preference', 'Program relevance', 'Low', 'Actionability', 'Not Directly Actionable', 'How NLP reached this result', 'pogi participants', 'I want more']) assert.ok(html.includes(label), label)
  assert.doesNotMatch(html, />Suggestion<|No clear sentiment was identified|No specific feedback topic was identified/)
})

test('legacy feedback comments remain renderable without context metadata', () => {
  const html = renderToStaticMarkup(React.createElement(FeedbackComment, { comment: { id: 'old', text: 'Unclear wording', activityTitle: 'Youth workshop', submittedAt: '2026-11-23T08:00:00Z', sentiment: 'no-signal', themes: [], themeDetails: [], matchedTerms: [], sentimentSource: 'none' } }))
  assert.match(html, /Uncertain/)
  assert.match(html, /insufficient evaluative evidence/)
})

test('feedback card exposes full evaluation context without merging its rating with comment sentiment', () => {
  const text = 'I want more pogi participants'
  const analysis = analyzeFeedback(text)
  const overall = analyzeOverallEvaluation({ rating: 3, feedback: text, responses: { fb_valuable: 'Knowledge and skills gained', fb_improve: 'Time management', fb_learning: 'Practical skills', fb_attend_again: 'Probably not', fb_participation: 'Active participant in all sessions', fb_time_mgmt: 'Excellent — ran on schedule', q1: '3', q2: '3', q3: '3', q4: '3', overall_star: '3' } }, analysis)
  const html = renderToStaticMarkup(React.createElement(FeedbackComment, { comment: { id: 'context', text, activityTitle: 'Youth workshop', submittedAt: '2026-11-23T08:00:00Z', sentiment: analysis.label, isSuggestion: analysis.isSuggestion, context: analysis.context, themes: analysis.themes.map(theme => theme.theme), themeDetails: analysis.themes, matchedTerms: analysis.matchedTerms, sentimentSource: 'rules', overallEvaluation: overall } }))
  for (const value of ['Full evaluation context', 'Overall Evaluation Analysis', 'Neutral Overall Rating', 'Written comment sentiment', 'Overall rating', '3/5', 'Time management', 'Probably not', 'not necessarily contradictory', 'Low intention to attend again', 'does not establish their reason or prove dissatisfaction']) assert.ok(html.includes(value), value)
  assert.match(html, /not evidence that this preference caused/)
  assert.doesNotMatch(html, /Would not recommend|invalid response|participant is dissatisfied/)
})

test('report fetch includes saved survey answers and attaches overall context without changing numerical aggregates', async () => {
  const responses = { fb_valuable: 'Knowledge and skills gained', fb_improve: 'Time management', fb_learning: 'Practical skills', fb_attend_again: 'Probably not', fb_participation: 'Active participant in all sessions', fb_time_mgmt: 'Excellent — ran on schedule', q1: '3', q2: '3', q3: '3', q4: '3', overall_star: '3' }
  const tables = { legacy_activities: [{ id: 'a', title: 'Youth workshop', status: 'closed', slots: 1, start_date: '2026-11-23', programs: { name: 'Education' } }], registration_details: [{ id: 'r', activity_id: 'a', status: 'attended', gender_identity: 'Female', age: 20, barangay: 'Sample' }], budget_entries: [], evaluations: [{ id: 'e', activity_id: 'a', rating: 3, would_recommend: false, feedback: 'I want more pogi participants', responses, submitted_at: '2026-11-23T08:00:00Z' }] }
  const selected = new Map()
  const supabase = { from(table) { return { select(columns) { selected.set(table, columns); return this }, gte() { return this }, lte() { return this }, in() { return this }, neq() { return this }, order() { return this }, then(resolve, reject) { return Promise.resolve({ data: tables[table], error: null }).then(resolve, reject) } } } }
  const { generateReport } = load('src/features/reports/reportService.ts', { '../../lib/supabase': { supabase }, '../evaluations/feedbackAnalyzer': { analyzeFeedbackHybrid: async comments => ({ analyses: comments.map(analyzeFeedback), sentimentSources: comments.map(() => 'rules'), semanticAssistedComments: 0, modelStatus: 'unavailable' }) } })
  const report = await generateReport('2026-11-01', '2026-11-30')
  assert.ok(selected.get('evaluations').split(',').map(value => value.trim()).includes('responses'))
  const comment = report.feedbackAnalysis.comments[0]
  assert.equal(comment.sentiment, 'neutral')
  assert.equal(comment.overallEvaluation.rating, 3)
  assert.equal(comment.overallEvaluation.reviewFlags.length, 2)
  assert.equal(report.feedbackAnalysis.sentimentCounts.neutral, 1)
  assert.equal(report.avgSatisfaction, '3.0')
  assert.equal(report.evalRows[0].recommendPct, '0%')
  assert.equal(report.totalAttended, 1)
  assert.doesNotMatch(report.insights.join(' '), /appearance-based|participant is dissatisfied/)
})
