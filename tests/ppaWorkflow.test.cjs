const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { PGlite } = require('@electric-sql/pglite')
function load(file) {
  file = path.resolve(file)
  const output = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText
  const module={exports:{}}
  new Function('require','module','exports',output)(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name)+'.ts'):require(name),module,module.exports)
  return module.exports
}
const model=load('src/features/proposals/proposalModel.ts')
const {parseProposal}=load('src/features/proposals/parseProposal.ts')
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const admin=uuid(1),participant=uuid(2),facilitator=uuid(3),program=uuid(4),facilitatorId=uuid(5)

test('PPA parser extracts the sample without inventing dates, times or public summaries',()=>{
  const text=`PPA DESIGN\nI. Identifying Information\nPPA Title: PANABO CITY YOUTH PEACE SUMMIT 2026\nPPA Type: Capacity Development\nPPA Area: : Panabo City Gym\nPPA Beneficiaries: 125 SK Officials, 100 Youth Organization, 50 CYDC, 10 CYDO, 15 MEN and Women in Uniform (150M/150F)\nPPA Duration: September 2026\nBudget Allocation: Five Hundred Thousand Pesos only (Php 500,000.00)\nII.Rationale\nA three-day youth leadership event.\nIII. Objectives\nTo enhance leadership potential;\nTo impart social responsibility.\nIV. Schedule of Implementation:\nActivities | PPA Duration | Expected Output\nYouth Peace Summit | September | Nurture future leaders and build effective teams.\nV. Budgetary Requirements:\nMEALS 300px X 7 meal x 180.00 = 378,000.00 | Summit | 378,000.00 | 189,000.00\nSNACKS 300px x5(AM.PM) x 60.00 | | 90,000.00 | 90,000.00\nTarpaulin 1pc x 2,000.00 | | 2,000.00 | 2,000.00\nTraining kit 300pcs X 100.00 | | 30,000.00 | 30,000.00\nPrepared by: Authorized officer`
  const {fields,extraction}=parseProposal([{page:null,text,method:'text'}])
  assert.equal(fields.slots,'300'); assert.equal(fields.allocation,'500000')
  assert.equal(fields.programType,'Capacity Development'); assert.equal(fields.venue,'Panabo City Gym')
  assert.equal(fields.startDate,''); assert.equal(fields.startTime,''); assert.equal(fields.summary,'')
  assert.equal(model.budgetTotal(fields.budgetItems),500000)
  assert.ok(extraction.warnings.some(warning=>warning.includes('differs')))
  assert.ok(fields.objectives.includes('leadership')); assert.ok(fields.outputs.includes('Nurture'))
})
test('program matching accepts case and whitespace differences but rejects ambiguity',()=>{
  assert.equal(model.matchProgram(' capacity   DEVELOPMENT ',[{id:'a',name:'Capacity Development'}]),'a')
  assert.equal(model.matchProgram('Capacity Development',[{id:'a',name:'Capacity Development'},{id:'b',name:'capacity development'}]),'')
  assert.equal(model.matchProgram('Health',[{id:'a',name:'Health Education'}]),'')
})
test('upload validation rejects mixed files, empty files, oversized batches, and too many photos',()=>{
  assert.throws(()=>model.validateUploadSet([{name:'x.pdf',size:10},{name:'x.jpg',size:10}]),/one Word\/PDF/)
  assert.throws(()=>model.validateUploadSet([{name:'x.png',size:0}]),/nonempty/)
  assert.throws(()=>model.validateUploadSet([{name:'x.pdf',size:21*1024*1024}]),/20 MB/)
  assert.throws(()=>model.validateUploadSet(Array.from({length:21},()=>({name:'x.jpg',size:10}))),/20 photos/)
  model.validateUploadSet([{name:'SIGNED.DOCX',size:10}])
})
test('age is checked on both dates, including birthday boundaries',()=>{
  assert.equal(model.eligibleOnBothDates('2011-05-02','2026-05-01','2026-05-03'),false)
  assert.equal(model.eligibleOnBothDates('1995-05-02','2026-05-01','2026-05-03'),false)
  assert.equal(model.eligibleOnBothDates('2011-05-02','2026-05-02','2026-05-03'),true)
  assert.equal(model.eligibleOnBothDates('1996-05-02','2026-05-02','2026-05-03'),true)
})

test('PPA database workflow: privacy, publication atomicity, history, and age guards',async t=>{
  const db=new PGlite(); t.after(()=>db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage to authenticated;
    create table public.admin_users(user_uuid uuid primary key,role text);
    create function public.is_legacy_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.admin_users where user_uuid=auth.uid() and role='superadmin')$$;
    create function public.activity_lifecycle(date,time,date,time) returns text language sql stable as $$select case when ($1+$2) at time zone 'Asia/Manila'>now() then 'upcoming' when ($3+$4) at time zone 'Asia/Manila'<now() then 'completed' else 'ongoing' end$$;
    create table public.programs(id uuid primary key default gen_random_uuid(),name text,created_by uuid);
    create table public.participants(user_uuid uuid primary key,birthday date);
    create table public.facilitators(id uuid primary key,user_uuid uuid);
    create table public.legacy_activities(id uuid primary key default gen_random_uuid(),program_id uuid,title text,status text default 'open',
      start_date date not null,end_date date not null,start_time time,end_time time,venue text default '',
      preview_desc text default '',full_desc text default '',outcomes text[] default '{}',schedule text[] default '{}',
      manually_closed boolean default false,note text default '',slots integer default 0,taken integer default 0);
    create table public.activity_facilitators(activity_id uuid references public.legacy_activities,facilitator_id uuid references public.facilitators,primary key(activity_id,facilitator_id));
    create table public.registrations(id uuid primary key default gen_random_uuid(),activity_id uuid references public.legacy_activities,user_uuid uuid,status text default 'registered',registered_at timestamptz default now());
    create table public.attendance_log(id uuid primary key,activity_id uuid,registration_id uuid,attendance_date date);
    create table public.evaluations(id uuid primary key,activity_id uuid,registration_id uuid);
    create table public.budget_entries(id uuid primary key default gen_random_uuid(),activity_id uuid,amount numeric check(amount>0),entry_type text,category text,description text);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
  `)
  await db.exec(fs.readFileSync('supabase/migrations/20261117000000_portal_notifications.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/20261117010000_ppa_document_workflow.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/20261117020000_approved_ppa_budgets.sql','utf8'))
  await db.query('insert into auth.users values ($1),($2),($3)',[admin,participant,facilitator])
  await db.query("insert into admin_users values ($1,'superadmin'),($2,'facilitator')",[admin,facilitator])
  await db.query("insert into participants values ($1,(current_date-interval '20 years')::date)",[participant])
  await db.query('insert into facilitators values ($1,$2)',[facilitatorId,facilitator])
  await db.query("insert into programs values ($1,'Capacity Development',$2)",[program,admin])
  const claim=user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user])
  await claim(admin)
  const date=(await db.query("select (current_date+60)::text as start,(current_date+62)::text as end")).rows[0]
  const fields={...structuredClone(model.emptyProposal),title:'Youth Leadership',programId:program,programType:'Capacity Development',venue:'City Gym',slots:'300',startDate:date.start,endDate:date.end,startTime:'09:00',endTime:'17:00',summary:'Join a leadership workshop.',rationale:'Develop youth leadership.',objectives:'Build confidence',outputs:'New leadership skills',allocation:'500000',budgetItems:[{description:'Meals',quantity:1,unitCost:500000}],facilitatorIds:[facilitatorId]}
  const storagePath=`${admin}/test/signed.pdf`
  await db.query("insert into storage.objects(bucket_id,name) values ('ppa-documents',$1)",[storagePath])
  const files=[{path:storagePath,name:'signed.pdf',size:100,type:'application/pdf'}]
  const importDoc=async(hash='a'.repeat(64),id=null,revision=null,sourceFields=fields)=> (await db.query('select public.import_ppa_document($1,$2,$3,$4,$5,$6) as id',[id,revision,hash,JSON.stringify(files),JSON.stringify({pages:[{page:1,text:'Signed PPA',method:'text'}],warnings:[],sources:{}}),JSON.stringify(sourceFields)])).rows[0].id
  const proposalId=await importDoc()
  const proposal=async()=> (await db.query('select * from ppa_proposals where id=$1',[proposalId])).rows[0]
  const count=async table=>Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n)
  let activityId
  await t.test('upload creates only a private draft, with no activity, allocation, assignment, or notification',async()=>{
    assert.equal(await count('ppa_proposals'),1)
    for(const table of ['legacy_activities','budget_entries','activity_facilitators','notifications']) assert.equal(await count(table),0)
    assert.equal(await importDoc(),proposalId); assert.equal(await count('ppa_proposals'),1)
  })
  await t.test('participants cannot read proposals or source files and cannot publish',async()=>{
    await claim(participant); await db.exec('set role authenticated')
    try {
      assert.equal(await count('ppa_proposals'),0); assert.equal(await count('ppa_documents'),0)
      assert.equal(await count('storage.objects'),0)
      await assert.rejects(db.query('select publish_ppa_proposal($1,1,true,true)',[proposalId]),/Administrator/)
      await assert.rejects(db.query("select ensure_ppa_program('Unapproved')"),/Administrator/)
    } finally {await db.exec('reset role');await claim(admin)}
  })
  await t.test('invalid publication rolls back everything',async()=>{
    await assert.rejects(db.query('select publish_ppa_proposal($1,1,false,true)',[proposalId]),/Confirm the signed/)
    await db.query('select save_ppa_draft($1,1,$2)',[proposalId,JSON.stringify({...fields,facilitatorIds:[uuid(999)]})])
    await assert.rejects(db.query('select publish_ppa_proposal($1,2,true,true)',[proposalId]),/facilitator/)
    assert.equal(await count('legacy_activities'),0); assert.equal(await count('budget_entries'),0)
    await db.query('select save_ppa_draft($1,2,$2)',[proposalId,JSON.stringify(fields)])
  })
  await t.test('publication creates exactly one activity, one approved allocation, and the selected assignments',async()=>{
    const revision=(await proposal()).revision
    activityId=(await db.query('select publish_ppa_proposal($1,$2,true,true) as id',[proposalId,revision])).rows[0].id
    assert.equal(await count('legacy_activities'),1);assert.equal(await count('budget_entries'),1);assert.equal(await count('activity_facilitators'),1)
    assert.equal((await db.query('select amount from budget_entries')).rows[0].amount,'500000')
    assert.equal((await db.query('select publish_ppa_proposal($1,$2,true,true) as id',[proposalId,revision])).rows[0].id,activityId)
    assert.equal(await count('ppa_publications'),1);assert.equal(await count('budget_entries'),1)
    assert.ok(await count('notifications')>0)
  })
  await t.test('attached signed files cannot be deleted',async()=>{
    await db.exec('set role authenticated')
    try {assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0)} finally {await db.exec('reset role')}
  })
  await t.test('replacement preserves reviewed fields, source versions, and the published activity',async()=>{
    const p=await proposal()
    await importDoc('b'.repeat(64),proposalId,p.revision,{...fields,title:'Unreviewed replacement'})
    assert.equal((await proposal()).fields.title,fields.title);assert.equal((await proposal()).state,'draft')
    assert.equal(await count('ppa_documents'),2);assert.equal(await count('legacy_activities'),1)
    assert.equal((await db.query('select title from legacy_activities')).rows[0].title,fields.title)
    await assert.rejects(db.query('select save_ppa_draft($1,$2,$3)',[proposalId,p.revision,JSON.stringify({...fields,title:'Stale overwrite'})]),/another session/)
  })
  await t.test('both-date age rules reject a 14-year-old and someone turning 31 before the activity',async()=>{
    const young=uuid(20),older=uuid(21)
    await db.query('insert into auth.users values ($1),($2)',[young,older])
    await db.query("insert into participants values ($1,(current_date-interval '15 years'+interval '1 day')::date),($2,($3::date-interval '31 years')::date)",[young,older,date.start])
    await assert.rejects(db.query('insert into registrations(activity_id,user_uuid) values ($1,$2)',[activityId,young]),/15–30/)
    await assert.rejects(db.query('insert into registrations(activity_id,user_uuid) values ($1,$2)',[activityId,older]),/15–30/)
    await db.query('insert into registrations(activity_id,user_uuid) values ($1,$2)',[activityId,participant])
    assert.equal(await count('registrations'),1)
  })
  await t.test('rescheduling flags affected registrations without cancellation, preserving allocations and registrations',async()=>{
    const p=await proposal()
    const future=(await db.query("select (current_date+interval '11 years')::date::text as start,(current_date+interval '11 years'+interval '2 days')::date::text as finish")).rows[0]
    await db.query('select save_ppa_draft($1,$2,$3)',[proposalId,p.revision,JSON.stringify({...fields,startDate:future.start,endDate:future.finish})])
    await db.query('select publish_ppa_proposal($1,$2,true,true)',[proposalId,p.revision+1])
    assert.equal(await count('legacy_activities'),1);assert.equal(await count('registrations'),1);assert.equal(await count('budget_entries'),1)
    assert.equal((await db.query('select status from registrations')).rows[0].status,'registered')
    assert.equal(await count('registration_eligibility_reviews'),1)
    assert.equal(await count('ppa_publications'),2)
  })
  let lineId,expenseId
  await t.test('published itemized budgets transfer automatically, stay private, and never become actual expenses',async()=>{
    const versions=(await db.query('select * from ppa_budget_versions order by revision')).rows
    assert.equal(versions.length,2)
    assert.equal(versions[0].allocation,'500000')
    const items=(await db.query('select * from ppa_budget_items order by publication_id')).rows
    assert.equal(items.length,2)
    lineId=items[0].line_id
    assert.equal(items[1].line_id,lineId)
    assert.equal((await proposal()).fields.budgetItems[0].id,lineId)
    assert.equal((await db.query("select count(*)::int n from budget_entries where entry_type='expense'")).rows[0].n,0)
    await claim(participant);await db.exec('set role authenticated')
    try {
      assert.equal(await count('ppa_budget_versions'),0);assert.equal(await count('ppa_budget_items'),0)
      await assert.rejects(db.query("update ppa_budget_items set unit_cost=1"),/permission denied/)
      await assert.rejects(db.query('select materialize_ppa_budget($1)',[versions[0].id]),/permission denied/)
    } finally {await db.exec('reset role');await claim(admin)}
    await db.exec('set role authenticated')
    try {
      assert.equal(await count('ppa_budget_versions'),2)
      await assert.rejects(db.query('delete from ppa_budget_versions'),/permission denied/)
    } finally {await db.exec('reset role')}
    await db.query('select materialize_ppa_budget($1)',[versions[0].id])
    assert.equal(await count('ppa_budget_versions'),2)
  })
  await t.test('actual expenses link to approved items and unplanned expenses require explanations',async()=>{
    expenseId=(await db.query("insert into budget_entries(activity_id,amount,entry_type,category,approved_budget_item_id) values($1,25000,'expense','Food',$2) returning id",[activityId,lineId])).rows[0].id
    await assert.rejects(db.query("insert into budget_entries(activity_id,amount,entry_type,category) values($1,100,'expense','Other')",[activityId]),/Explain why/)
    await db.query("insert into budget_entries(activity_id,amount,entry_type,category,unplanned_reason) values($1,750,'expense','Other','Emergency transport of materials')",[activityId])
    const other=(await db.query("insert into legacy_activities(title,start_date,end_date) values('Other',$1,$2) returning id",[date.start,date.end])).rows[0].id
    await assert.rejects(db.query("insert into budget_entries(activity_id,amount,entry_type,approved_budget_item_id) values($1,100,'expense',$2)",[other,lineId]),/another activity/)
    await assert.rejects(db.query("insert into budget_entries(activity_id,amount,entry_type,approved_budget_item_id) values($1,100,'allocation',$2)",[activityId,lineId]),/Only actual/)
    assert.equal((await db.query("select sum(amount) total from budget_entries where activity_id=$1 and entry_type='expense'",[activityId])).rows[0].total,'25750')
  })
  await t.test('a draft budget stays private; publishing revisions retains item identity, previous approvals and actual expenses',async()=>{
    const p=await proposal()
    const revised={...p.fields,budgetItems:[{...p.fields.budgetItems[0],description:'Meals and refreshments',unitCost:400000}],reviewNote:'Approved contingency accounts for the remaining allocation.'}
    await db.query('select save_ppa_draft($1,$2,$3)',[proposalId,p.revision,JSON.stringify(revised)])
    assert.equal(await count('ppa_budget_versions'),2)
    await db.query('select publish_ppa_proposal($1,$2,true,true)',[proposalId,p.revision+1])
    const snapshots=(await db.query('select i.* from ppa_budget_items i join ppa_budget_versions v on v.id=i.publication_id order by v.revision')).rows
    assert.deepEqual(snapshots.map(row=>row.line_id),[lineId,lineId,lineId])
    assert.deepEqual(snapshots.map(row=>row.unit_cost),['500000','500000','400000'])
    assert.equal((await db.query('select approved_budget_item_id from budget_entries where id=$1',[expenseId])).rows[0].approved_budget_item_id,lineId)
    assert.equal((await db.query("select sum(amount) total from budget_entries where activity_id=$1 and entry_type='expense'",[activityId])).rows[0].total,'25750')
  })
  await t.test('removed approved items retain old expense links but cannot receive new expenses',async()=>{
    const p=await proposal()
    await db.query('select save_ppa_draft($1,$2,$3)',[proposalId,p.revision,JSON.stringify({...p.fields,budgetItems:[]})])
    await db.query('select publish_ppa_proposal($1,$2,true,true)',[proposalId,p.revision+1])
    await assert.rejects(db.query("insert into budget_entries(activity_id,amount,entry_type,approved_budget_item_id) values($1,100,'expense',$2)",[activityId,lineId]),/no longer/)
    await db.query('update budget_entries set amount=24000 where id=$1',[expenseId])
    assert.equal((await db.query('select approved_budget_item_id from budget_entries where id=$1',[expenseId])).rows[0].approved_budget_item_id,lineId)
    assert.equal(await count('ppa_budget_versions'),4)
    assert.equal(await count('ppa_budget_items'),3)
  })
})
