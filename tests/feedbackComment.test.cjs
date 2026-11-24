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
const assessmentModel = load('src/features/evaluations/organizationEvaluation.ts')

test('organization summary shows Good instead of Neutral for a score of three', () => {
  const OverallEvaluationSummary = load('src/features/evaluations/OverallEvaluationSummary.tsx').default
  const responses = {form_version: assessmentModel.ASSESSMENT_VERSION, facilitator_name: 'Example', ...Object.fromEntries(assessmentModel.ASSESSMENT_QUESTIONS.map(q => [q.key, 'Good']))}
  const analysis = analyzeOverallEvaluation({rating: 3, responses, feedback: 'I want more pogi participants'})
  const html = renderToStaticMarkup(React.createElement(OverallEvaluationSummary, {analysis}))
  assert.match(html, /Assessment Average/)
  assert.match(html, /3\/5 - Good/)
  assert.match(html, /Written comment sentiment/)
  assert.match(html, />Neutral</)
  assert.doesNotMatch(html, /3\/5 — Neutral|Neutral Overall Rating/)
})

test('full organization response separates selected suggestions from the original typed comment', () => {
  const Details = load('src/features/evaluations/EvaluationResponseDetails.tsx').default
  const responses = {form_version: assessmentModel.ASSESSMENT_VERSION, facilitator_name: 'Example', selected_suggestions: '["hands-on","questions"]', written_comment: 'My own words', ...Object.fromEntries(assessmentModel.ASSESSMENT_QUESTIONS.map(q => [q.key, 'Good']))}
  const html = renderToStaticMarkup(React.createElement(Details, {evaluation: {id:'preview',responses,rating:3,feedback:assessmentModel.assessmentFeedback(responses, responses.written_comment),participantName:'Example participant',activityTitle:'Example training',submittedAt:'2026-11-24T00:00:00Z'}}))
  assert.match(html, /Selected suggestions/)
  assert.match(html, /I suggest adding more hands-on activities/)
  assert.match(html, /Please allow more time for questions and discussion/)
  assert.equal((html.match(/My own words/g) || []).length, 1)
  assert.doesNotMatch(html, /written_comment|selected_suggestions|Additional Answers/)
})

test('editable responses show the final comment once without restoring stale suggestion metadata', () => {
  const Details = load('src/features/evaluations/EvaluationResponseDetails.tsx').default
  const finalText = 'My edited comment.\nPlease allow more time for questions and discussion.'
  const responses = {form_version: assessmentModel.ASSESSMENT_VERSION, feedback_format: assessmentModel.EDITABLE_FEEDBACK_FORMAT, facilitator_name: 'Example', selected_suggestions:'["hands-on","questions"]', written_comment:'Stale text that must not replace the final comment'}
  const evaluation = {id:'preview',responses,rating:3,feedback:finalText,participantName:'Example participant',activityTitle:'Example training',submittedAt:'2026-11-24T00:00:00Z'}
  const html = renderToStaticMarkup(React.createElement(Details, {evaluation}))
  assert.equal((html.match(/My edited comment/g) || []).length, 1)
  assert.equal((html.match(/Please allow more time for questions and discussion/g) || []).length, 1)
  assert.match(html, /Includes 1 quick suggestion selected by the participant/)
  assert.doesNotMatch(html, /Stale text|hands-on|feedback_format|written_comment|selected_suggestions/)
})

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

test('Insights analyzes each final edited comment once without reinserting selected suggestions', async () => {
  const responses = {form_version:assessmentModel.ASSESSMENT_VERSION,feedback_format:assessmentModel.EDITABLE_FEEDBACK_FORMAT,facilitator_name:'Example',selected_suggestions:'["hands-on","questions"]',...Object.fromEntries(assessmentModel.ASSESSMENT_QUESTIONS.map(q=>[q.key,'Good']))}
  const texts = ['Nindot ang venue.\nPlease allow more time for questions and discussion.', 'I want more pogi participants']
  const tables = {legacy_activities:[{id:'a',title:'Sample training',status:'completed',slots:2,start_date:'2026-11-24',programs:{name:'Education'}}],registration_details:[],budget_entries:[],evaluations:texts.map((feedback,index)=>({id:String(index),activity_id:'a',rating:3,would_recommend:false,feedback,responses:{...responses,written_comment:'Stale text'},submitted_at:'2026-11-24T01:00:00Z'}))}
  let analyzed
  const supabase={from(table){return {select(){return this},gte(){return this},lte(){return this},in(){return this},neq(){return this},order(){return this},then(resolve,reject){return Promise.resolve({data:tables[table],error:null}).then(resolve,reject)}}}}
  const {generateReport}=load('src/features/reports/reportService.ts',{'../../lib/supabase':{supabase},'../evaluations/feedbackAnalyzer':{analyzeFeedbackHybrid:async comments=>{analyzed=comments;return {analyses:comments.map(analyzeFeedback),sentimentSources:comments.map(()=>'rules'),semanticAssistedComments:0,modelStatus:'unavailable'}}}})
  const report=await generateReport('2026-11-01','2026-11-30')
  assert.deepEqual(analyzed,texts)
  assert.deepEqual(report.feedbackAnalysis.comments.map(comment=>comment.text),texts)
  assert.deepEqual(report.feedbackAnalysis.comments.map(comment=>comment.quickSuggestionCount),[1,0])
  assert.equal(report.feedbackAnalysis.analyzedComments,2)
  assert.equal(report.feedbackAnalysis.comments[1].sentiment,'neutral')
  assert.equal(Object.values(report.feedbackAnalysis.sentimentCounts).reduce((sum,count)=>sum+count,0),2)
  assert.equal(report.avgSatisfaction,'3.0')
  assert.equal(report.evalRows[0].recommendPct,'Not asked')
  const html=renderToStaticMarkup(React.createElement(FeedbackComment,{comment:report.feedbackAnalysis.comments[0]}))
  assert.match(html,/Includes 1 quick suggestion selected by the participant/)
  assert.doesNotMatch(html,/hands-on|Stale text/)
})
