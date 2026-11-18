const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
function load(file,mocks={}) {
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const module={exports:{}}
  new Function('require','module','exports',output)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),module,module.exports)
  return module.exports
}
const model=load('src/features/budget/approvedBudgetService.ts',{'../../lib/supabase':{supabase:{}}})
const version={id:'v2',proposal_id:'p',activity_id:'a',revision:2,document_version:2,allocation:100,published_at:'2026-11-17T00:00:00Z',files:[],items:[{publication_id:'v2',line_id:'food',position:0,description:'Meals',quantity:2,unit_cost:25}]}
test('approved comparisons include partial payments and preserve overspending as a negative difference',()=>{
  const entries=[{approvedBudgetItemId:'food',amount:30},{approvedBudgetItemId:'food',amount:25}]
  const result=model.compareApprovedBudget(version,entries)
  assert.equal(result.lines[0].approved,50)
  assert.equal(result.lines[0].spent,55)
  assert.equal(result.lines[0].difference,-5)
})
test('removed items, explained unplanned costs and legacy unassigned expenses remain separately visible',()=>{
  const entries=[{approvedBudgetItemId:'food',amount:20},{approvedBudgetItemId:'removed',amount:15},{approvedBudgetItemId:null,amount:5,unplannedReason:'Emergency materials'},{approvedBudgetItemId:null,amount:8}]
  const result=model.compareApprovedBudget(version,entries)
  assert.equal(result.lines[0].spent,20)
  assert.equal(result.priorItems[0].amount,15)
  assert.equal(result.unplanned[0].amount,5)
  assert.equal(result.unassigned[0].amount,8)
  assert.equal(result.lines.reduce((sum,row)=>sum+row.spent,0)+[...result.priorItems,...result.unplanned,...result.unassigned].reduce((sum,row)=>sum+row.amount,0),48)
})
test('approved panel distinguishes current and past approvals, source version, breakdown and unplanned costs',()=>{
  const {default:Panel}=load('src/features/budget/ApprovedBudgetPanel.tsx',{'../proposals/proposalService':{},'./approvedBudgetService':model})
  const html=renderToStaticMarkup(React.createElement(Panel,{versions:[version,{...version,id:'v1',revision:1}],entries:[{amount:7,unplannedReason:'Urgent transport'}]}))
  assert.match(html,/Current approval/);assert.match(html,/Previous/);assert.match(html,/Approved cost breakdown/)
  assert.match(html,/Unplanned expenses/);assert.match(html,/supporting document/);assert.match(html,/version 2/)
})
test('saving and correcting expenses send the approved item or unplanned explanation to the database',async()=>{
  const writes=[]
  const supabase={from:()=>({insert:async values=>{writes.push(values);return {error:null}},update:values=>({eq:()=>({eq:async()=>{writes.push(values);return {error:null}}})})})}
  const service=load('src/features/budget/budgetService.ts',{'../../lib/supabase':{supabase},'../activities/activityService':{}})
  assert.equal((await service.saveBudgetEntry('a','expense',25,'Food','Lunch','Admin','food','')).ok,true)
  assert.equal(writes[0].approved_budget_item_id,'food')
  assert.equal((await service.updateExpenseEntry('expense',28,'Travel','Fare',null,'  Emergency transport  ')).ok,true)
  assert.equal(writes[1].approved_budget_item_id,null)
  assert.equal(writes[1].unplanned_reason,'Emergency transport')
})
