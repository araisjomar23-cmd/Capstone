const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const keys = ['assessment_content', 'assessment_job_support', 'assessment_technical_knowledge', 'assessment_participation', 'assessment_methods', 'assessment_relevance', 'assessment_speaker']
const responses = {form_version: 'cydo-assessment-v1', facilitator_name: 'Example facilitator', ...Object.fromEntries(keys.map(key => [key, 'Good']))}
const user = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'

test('organization assessment database validation preserves attendance and historical form behavior', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table legacy_activities(id uuid primary key default gen_random_uuid(), title text default 'Example training', start_date date, end_date date, start_time time, end_time time, manually_closed boolean default false, checkin_early_access_minutes smallint default 30);
    create function public.activity_lifecycle(date,time,date,time) returns text language sql stable as $$select 'completed'::text$$;
    create table registrations(id uuid primary key default gen_random_uuid(), ref_code text unique, user_uuid uuid, activity_id uuid references legacy_activities, status text default 'registered', attended_at timestamptz);
    create table evaluations(id uuid primary key default gen_random_uuid(), registration_id uuid unique references registrations, activity_id uuid, rating smallint not null check(rating between 1 and 5), feedback text, would_recommend boolean, responses jsonb);
    create table attendance_log(registration_id uuid, activity_id uuid, checked_in_at timestamptz, attendance_date date, day_number smallint, method text, unique(registration_id,attendance_date,day_number));
  `)
  // Install the prior definition first, then exercise the actual migration upgrade.
  await db.exec(fs.readFileSync('supabase/migrations/20261031040000_evaluation_first_attendance_window.sql', 'utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/20261124000000_organization_evaluation_form.sql', 'utf8'))
  const activity = (await db.query("insert into legacy_activities(start_date,end_date,start_time,end_time) values(current_date-1,current_date-1,'09:00','17:00') returning id")).rows[0].id
  let counter = 0
  async function registration(status = 'registered') {
    const ref = 'REF-' + (++counter)
    await db.query('insert into registrations(ref_code,user_uuid,activity_id,status) values($1,$2,$3,$4)', [ref, user, activity, status])
    return ref
  }
  const claim = value => db.query("select set_config('request.jwt.claim.sub',$1,false)", [value])
  const submit = (ref, answers = responses, feedback = 'Nindot ang training.', rating = 3, attendance = true) => db.query('select submit_legacy_evaluation($1,$2::smallint,$3,$4,$5::jsonb,$6)', [ref, rating, feedback, true, JSON.stringify(answers), attendance])
  const counts = async () => (await db.query('select (select count(*)::int from evaluations) evaluations, (select count(*)::int from attendance_log) attendance')).rows[0]
  await claim(user)

  await t.test('complete organization response records evaluation and QR attendance together', async () => {
    const ref = await registration()
    await submit(ref)
    const saved = (await db.query('select * from evaluations')).rows[0]
    assert.deepEqual(saved.responses, responses)
    assert.equal(saved.rating, 3)
    assert.equal(saved.feedback, 'Nindot ang training.')
    assert.equal(saved.would_recommend, false)
    assert.deepEqual(await counts(), { evaluations: 1, attendance: 1 })
    assert.equal((await db.query('select status from registrations where ref_code=$1', [ref])).rows[0].status, 'attended')
    await assert.rejects(submit(ref), /unique|duplicate/)
    assert.deepEqual(await counts(), { evaluations: 1, attendance: 1 })
  })

  await t.test('incomplete and malformed answers cannot create attendance or an evaluation', async () => {
    const ref = await registration()
    const before = await counts()
    for (const key of keys) {
      const missing = {...responses}; delete missing[key]
      await assert.rejects(submit(ref, missing), /every assessment/)
      await assert.rejects(submit(ref, {...responses, [key]: 'Neutral'}), /every assessment/)
    }
    for (const name of ['', '   ', 'x'.repeat(301), {}, null]) await assert.rejects(submit(ref, {...responses, facilitator_name: name}), /facilitator/)
    for (const comment of ['', '   ', 'x'.repeat(3001)]) await assert.rejects(submit(ref, responses, comment), /Comments\/Suggestions/)
    await assert.rejects(submit(ref, {...responses, form_version: 'unknown'}), /not supported/)
    await assert.rejects(submit(ref, [], 'comment'), /required evaluation/)
    await assert.rejects(submit(ref, responses, 'comment', 5), /calculated assessment/)
    assert.deepEqual(await counts(), before)
  })

  await t.test('ownership, attendance eligibility, cancellation and event windows still apply', async () => {
    const ref = await registration()
    await claim(other)
    await assert.rejects(submit(ref), /does not belong/)
    await claim(user)
    await assert.rejects(submit(ref, responses, 'comment', 3, false), /after attendance/)
    await assert.rejects(submit(await registration('inactive')), /cancelled/)
    await db.query('update legacy_activities set manually_closed=true where id=$1', [activity])
    await assert.rejects(submit(ref), /manually closed/)
    await db.query('update legacy_activities set manually_closed=false,start_date=current_date+1,end_date=current_date+1 where id=$1', [activity])
    await assert.rejects(submit(ref), /near the end/)
    await db.query('update legacy_activities set start_date=current_date-1,end_date=current_date-1 where id=$1', [activity])
  })

  await t.test('seven-item averages are derived on the server and all exact ratings are preserved', async () => {
    const ref = await registration('attended')
    const varied = {...responses, assessment_content: 'Excellent', assessment_methods: 'Excellent'}
    await assert.rejects(submit(ref, varied, 'Helpful', 3, false), /calculated assessment/)
    await submit(ref, varied, 'Helpful', 4, false)
    const saved = (await db.query('select e.* from evaluations e join registrations r on r.id=e.registration_id where r.ref_code=$1', [ref])).rows[0]
    assert.deepEqual(saved.responses, varied)
    assert.equal(saved.rating, 4)
  })

  await t.test('old form submissions and previously saved answers remain supported', async () => {
    const before = (await db.query('select * from evaluations order by id')).rows
    const legacy = Object.fromEntries(['fb_valuable','fb_improve','fb_learning','fb_attend_again','fb_participation','fb_time_mgmt','q1','q2','q3','q4','overall_star'].map(key => [key, '5']))
    await submit(await registration(), legacy, 'Historical response', 5)
    assert.deepEqual((await db.query('select * from evaluations where feedback <> $1 order by id', ['Historical response'])).rows, before)
    assert.equal((await db.query('select would_recommend from evaluations where feedback=$1', ['Historical response'])).rows[0].would_recommend, true)
    await db.exec('set role anon')
    try { await assert.rejects(submit('REF'), /permission denied/) } finally { await db.exec('reset role') }
  })

  await t.test('selected suggestions and a separate written comment survive the existing RPC together', async () => {
    const answers = { ...responses, selected_suggestions: '["hands-on","questions"]', written_comment: 'The speaker was helpful.' }
    const feedback = 'I suggest adding more hands-on activities.\nPlease allow more time for questions and discussion.\n\nThe speaker was helpful.'
    const ref = await registration()
    await submit(ref, answers, feedback)
    const saved = (await db.query('select e.* from evaluations e join registrations r on r.id=e.registration_id where r.ref_code=$1', [ref])).rows[0]
    assert.equal(saved.feedback, feedback)
    assert.equal(saved.responses.written_comment, answers.written_comment)
    assert.equal(saved.responses.selected_suggestions, answers.selected_suggestions)
    const suggestionOnly = { ...answers, written_comment: '' }
    await submit(await registration(), suggestionOnly, 'I suggest adding more hands-on activities.\nPlease allow more time for questions and discussion.')
  })
})
