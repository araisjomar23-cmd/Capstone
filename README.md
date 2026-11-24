# PRIME: CYDO Panabo MEAL System

PRIME is the youth activity management system for the City Youth Development Office (CYDO) in Panabo City. This workspace recreates the archived system's public, participant, facilitator, and administrator workflows.

## Requirements

- Node.js 20.19+ or 22.12+
- A Supabase project

## Project structure

```text
src/
  App.tsx       Route definitions
  components/  Shared layouts, dialogs, and UI
  features/    Activity, attendance, budget, auth, and report services
  pages/       Public, participant, facilitator, and admin screens
  lib/         Supabase client
  types/       Activity and registration types
supabase/
  migrations/   Versioned database schema and incremental updates
  config.toml   Supabase CLI project settings
```

Keep `.env.local`, `node_modules/`, and `dist/` at the project root. `.env.local` contains machine-specific Supabase settings and is excluded from version control.

## CAPTCHA activation

The account forms support Cloudflare Turnstile using its official browser SDK, with no additional npm dependency. Participant signup, shared login, password-reset emails, and facilitator account creation send the proof to Supabase Auth. Supabase performs server-side verification when CAPTCHA is enabled there. Password updates through an authenticated recovery session retain their existing flow.

The integration is inactive until `VITE_TURNSTILE_SITE_KEY` is configured. This lets the existing forms keep working during setup; it does **not** mean CAPTCHA protection is already active. See [.env.example](.env.example). The widget handles expired tokens, retries and narrow screens, and refreshes its proof after each authentication attempt. Proofs are not stored in participant or facilitator records.

Activate in this order:

1. Create a Managed Turnstile widget in Cloudflare for the production hostname `prime-meal.vercel.app`. Add only the preview or local hostnames you actually use. Keep its secret private; do not put it in a `VITE_` variable or commit it.
2. Set the public `VITE_TURNSTILE_SITE_KEY` in `.env.local` for local testing and the matching Vercel environment variables. Restart Vite locally; redeploy the frontend after changing a Vercel build variable. Use real widget keys for production, not Cloudflare's development test keys.
3. Verify the deployed signup, login, reset-email and Add Facilitator forms display and complete the security check. Then configure the matching secret in Supabase **Authentication → Bot and Abuse Protection**, choose Turnstile and enable CAPTCHA verification. Enabling it before the updated forms are deployed can interrupt authentication.
4. With designated test accounts, verify normal signup, staff/participant login, reset emails, facilitator creation, expired-proof retries and QR redirects on desktop and phone. Reject invalid or missing proofs at Supabase. Do not create fake participants in the live dataset for load testing.

Run `npm run test:captcha` for the offline regressions. These verify form behavior, proof forwarding, expiry/retry handling, SDK loading and widget cleanup; they do not replace a live test with your actual widget and Supabase settings. No database migration is needed. Vercel's firewall Log/Challenge setting is separate from Supabase Auth CAPTCHA protection. See the [Supabase CAPTCHA guide](https://supabase.com/docs/guides/auth/auth-captcha) and [Cloudflare SPA rendering guide](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).

## Supabase setup and migrations

1. Create a Supabase project and enable email/password authentication under **Authentication → Providers**.
2. Create `.env.local` with the Supabase URL and public anon key.
3. Sign the CLI in once with `npx supabase login`. Create a Supabase Personal Access Token from your Supabase account when prompted; enter it only in the terminal, never in chat or `.env.local`.
4. Link this folder to your remote project once: `npx supabase link --project-ref YOUR_PROJECT_REF`. Use the project reference from the Supabase project URL. Enter the database password only into the CLI prompt.
5. Check migration history with `npm run db:status` before deploying changes.

For a **new, empty Supabase database**, run `npm run db:push` to apply the migrations in order. The latest compatibility migration adds the archived app's tables alongside the current schema and copies existing activities, participant accounts, registrations, budgets, and evaluations where the records can be mapped. It does not drop existing tables or records.

For an **existing database**, first reconcile its state with migration history; do not push the initial schema over tables that already exist. The initial schema migration version is `20261016000000`; the PRIME feature migration version is `20261017`. If both migrations have already been applied manually in the Supabase Dashboard, and you have verified their tables, functions, and policies exist, record those versions without rerunning the SQL:

```powershell
npm run db:baseline
```

This updates only the CLI migration history; it does not execute the SQL or change application data. The Supabase CLI may prompt for the database password. Enter it in the terminal only. Then check `npm run db:status`; the local and remote versions should match. Preview any pending SQL with `npx supabase db push --linked --dry-run` before applying it with `npm run db:push`.

For future database changes, create a versioned migration with `npm run db:new -- describe_the_change`, write the SQL in the new file under `supabase/migrations/`, then run `npm run db:push`. Frontend-only changes do not need database migrations. Review every migration and the dry-run output before applying it to the remote database.

New self-registered accounts are youth participants. After creating the designated administrator account, register it as a PRIME superadmin in the Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'your-admin-email@example.com');

insert into public.admin_users (user_uuid, email, display_name, role)
select u.id, u.email, p.full_name, 'superadmin'
from auth.users u
join public.profiles p on p.id = u.id
where u.email = 'your-admin-email@example.com'
on conflict (user_uuid) do update set role = 'superadmin';
```

Replace the example email with the actual administrator email. Never add a public role selector to registration. Existing `admin` and `staff` profiles are mapped to `superadmin` by the compatibility migration.

## Portal notifications

Apply `supabase/migrations/20261117000000_portal_notifications.sql` to enable the notification bell in the administrator, facilitator, and participant portals. Follow the migration-history and dry-run steps above before using `npm run db:push`. If the CLI account cannot access the linked project, an authorized project owner can run this migration in that project's Supabase SQL Editor.

Notifications are generated by database triggers for new available activities, registration confirmations/cancellations, activity schedule/venue changes and manual closures, facilitator assignments/removals, check-ins, and evaluations. Staff receive updates only for their role and assigned activities; each inbox is protected by recipient-only row-level security. History and read status persist across devices. Events before the migration are not backfilled.

The inbox supports unread counts, All/Unread filters, marking one or all as read, and loading older notifications. It refreshes through Supabase Realtime and a 30-second fallback poll. `npm run test:notifications` runs the migration against an in-memory PostgreSQL engine and checks event recipients, RLS, restricted write permissions, pagination, and navigation boundaries.

## Signed PPA activity imports

In **Activities → New Activity → Create manually**, the proposal builder covers identifying information, exact dates and times, beneficiaries, public summary, rationale, objectives, implementation plan, expected outputs, itemized proposed costs, funding details and editable signatories. Download an editable `.docx` or choose **Print / Save PDF** and select **Save as PDF** in the browser dialog. Proposed expense totals must match the proposed allocation. Signature lines stay blank. The builder does not publish an activity, approve a budget, or save drafts online; download Word to keep your work. Closing an undownloaded draft asks for confirmation. Have the document signed, then use **Upload proposal** (also linked after export). The existing private draft review, signed-approval confirmations, facilitator assignment and publication process still applies. Export adds no dependency or migration. Run `npm run test:ppa` for document generation, validation, parsing and database workflow checks.

Administrators can open **Activities → Create activities from signed PPA designs** and upload one DOCX/PDF or an ordered set of up to 20 JPG/PNG photos. The combined limit is 20 MB; PDFs are limited to 20 pages. Word documents have a decompression safety limit. Password-protected documents are rejected.

The readers are loaded only when needed: Mammoth reads Word, PDF.js extracts PDF text, and Tesseract.js performs OCR in the browser for scans and photos. OCR downloads its English recognition model on first use; no paid OCR API or document-content upload to an OCR provider is used. A PDF can also be reprocessed entirely with OCR if its text layer is incomplete. Reading is cancellable. Extraction is template-based and must be reviewed; handwriting, low-quality scans, and unusual tables can require manual correction.

The private `ppa-documents` bucket retains original files. `ppa_proposals`, `ppa_documents`, and `ppa_publications` retain drafts, source versions, review notes, and publication history. These records are restricted to superadmins. A file fingerprint prevents duplicate imports, and optimistic revision checks prevent stale edits. Drafts never enter `legacy_activities`, assignments, budget totals, or participant notifications.

After reviewing the source, the admin resolves the program, exact dates/times, summary, capacity, planned expenses, and facilitator assignments. Publishing requires signed-approval and review confirmations and at least one facilitator account. The publication RPC creates/updates the live activity, its approved allocation, assignments, and publication history in one transaction. Retrying the same publication does not duplicate records. Planned expenses remain proposal data and are never recorded as actual spending. Existing activities retain their historical workflow; proposal-backed activities are edited through their review workspace.

All new/re-activated registrations require age 15–30 on both the Manila registration date and the first activity day. Schedule changes flag affected existing registrations in **Activities → Registration eligibility review**, without cancelling them. Admins record their follow-up notes. Completed activities cannot be overwritten through proposal publication.

Apply [the PPA migration](supabase/migrations/20261117010000_ppa_document_workflow.sql) before deploying the updated frontend. `npm run test:ppa` checks extraction, upload limits, program matching, date boundaries, private storage, atomic publication, history, stale edits, and eligibility guards in PostgreSQL. Test imports should remain drafts until the administrator has reviewed the actual signed source.

Apply [the approved-budget migration](supabase/migrations/20261117020000_approved_ppa_budgets.sql) to display published itemized costs in Budget Monitor. Every publication creates an approved budget snapshot with its supporting source version. Draft edits cannot change the approved figures. Existing published proposals are backfilled without creating actual expenses. Administrators link each expense to a current approved item, or record an explanation for unplanned spending. Previously recorded expenses remain intact, including expenses against removed items; unchanged item IDs carry spending across revisions. Previously unassigned entries are displayed separately until reviewed. Approved snapshots and source documents are restricted to administrators. `node --test tests/approvedBudget.test.cjs tests/ppaWorkflow.test.cjs` checks comparisons, expense writes, privacy, publication, and revision behavior.

Apply [the allocation-lock migration](supabase/migrations/20261119010000_lock_proposal_budget_allocation.sql) to make proposal allocations read-only. Each source retains its original extracted allocation independently of draft edits and OCR retries. Draft saves and publication must match that amount; normal administrator requests cannot insert, edit, or delete allocation entries for proposal-backed activities. A revised source updates the private draft allocation, and publication synchronizes the live allocation atomically. Missing amounts require a clearer approved document rather than manual entry. Extraction is still subject to human document review; this does not authenticate signatures or independently verify document contents. Participants continue to see the allocated total, without private cost breakdowns or expense records.

## Activity post reports

The Reports & Insights page opens on **Activity post report**. Its activity selector lists completed activities only, newest first, with Month, Year and Program filters. The date defaults to the current Manila month and year; changing filters protects unsaved report edits. Select an activity to prefill its schedule, target slots, recorded attendance, allocation and available published proposal context. The editor has four steps: **Activity details**, **Activity narrative**, **Signatories**, and **Review & print**. Completion progress and review links show which fields need attention. Enter actual highlights, review the background and objectives, and set the **Prepared by** and **Noted by** names and positions in their own cards. Every signatory is editable; sample signatory names are never prefilled. Changes affect the report snapshot only. Save incomplete drafts from any step and reopen them later. Printing / saving as PDF is available after the activity ends and all template fields are completed. The print layout follows the supplied template’s sections with CYDO text branding; the photographed PDAO letterhead is not reproduced.

Apply [the post-report migration](supabase/migrations/20261119020000_activity_post_reports.sql) before using report saving. Reports are restricted to administrators and concurrent saves detect stale revisions. Existing monitoring reports and insights remain available in their own views. Run `node --test tests/postReport.test.cjs` to verify prefill, validation, printable signatories, access controls and stale-save handling.

## Monthly insights

Reports and Insights adapt to the available content width beside the portal sidebar. Report forms stack on narrow screens, wide monitoring tables scroll within their sections, and the A4 post-report preview offers **Fit page** and **Actual size**. Preview scaling does not change printed/PDF document dimensions.

The **Insights** view provides monthly performance cards, comparisons with the previous month, activity attendance bars and expandable takeaways. Use the month/year selectors, adjacent-month arrows, **This month**, or **Refresh** to explore a period. Feedback supports sentiment and topic filters, comment/activity search, and pagination. Each comment retains its original wording with an expandable analysis explanation. An unavailable comparison does not hide the current month’s results; missing data and empty periods have explicit states.

## Run locally

### Dashboard live tracking

The attendee demographics card starts with sectoral groups. Hover over it and scroll vertically to switch to the age view (Child Youth 15–17, Core Youth 18–24, Adult Youth 25–30); arrows and view dots also support touch and keyboard use. Wheel gestures are handled only inside the card, with a short cooldown for trackpads; Ctrl+wheel zoom remains available. Age counts use attended/completed registrations in the selected activity period, matching the attendance metric. Missing and out-of-bracket ages are excluded from age percentages and reported separately. A youth attending multiple activities contributes one attendance per registration, consistent with the rest of the dashboard.

The dashboard leads with a participation area graph and attendee sectoral distribution. Activity comparisons share a full-width tabbed panel with Registrations, Budget and Satisfaction views and a link to the related management page; longer lists scroll inside that panel. Activity status and upcoming events remain directly visible below. Needs-attention cards appear only when issues exist; a compact status line replaces the empty alert panel. Duplicate budget rings, program summary tables and recent-evaluation feeds are omitted from the dashboard; detailed records remain in their respective modules. Charts stack on small screens. Satisfaction uses actual evaluation averages on a fixed five-point scale and excludes activities without responses; the rating card retains the original five-point score without a duplicate percentage conversion.

The overview uses a simple heading with inline date controls, four compact metric cards and a restrained blue/teal palette. Hovering a card, focusing its controls, or tapping its info icon reveals the supporting counts and definitions; Escape dismisses the breakdown. Chart hover highlights and tooltips show exact values; comparison tabs support left/right arrow keys and Home/End. Large headline budget amounts are abbreviated, with full amounts available in the breakdown. Zero-denominator indicators remain unspecified rather than displaying invalid percentages. Motion respects reduced-motion preferences. These display changes preserve the existing calculations and date filters.

The administrator dashboard listens for program, activity, registration, attendance, budget, evaluation and participant changes. Event bursts are combined into a single follow-up read; failed reads preserve the last successful snapshot. Visible tabs also refresh every 30 seconds, on focus, and when connectivity returns. A fully closed channel is replaced automatically. Connection badges, last-updated timestamps and the manual Refresh button are hidden; automatic synchronization remains active. Existing Realtime-publication migrations already include the required tables; no additional migration is needed for this change.

Registrations count activity participation, not unique youths. Negative remaining balances remain visible. Run `npm run test:dashboard` for live-update recovery, aggregation, rendering and existing filter regression tests.

Before production sign-off, verify with administrator and participant/facilitator sessions in separate browsers: create/change a program activity, register, record attendance, record an expense and submit an evaluation; check the matching period and program totals update. Disconnect the administrator browser, verify it retains its prior totals, reconnect and check catch-up. Hide/restore the tab and simulate a failed read to check recovery. Confirm administrator access policies and the required Realtime publication in the deployed Supabase project. Automated local tests do not replace this live two-session acceptance check.

### Participant tracking

The administrator Participants directory supports combined date, program, activity, status, age-group and text filters. It distinguishes distinct youths from activity registration rows and includes completed registrations in attended totals. **View** opens personal details plus the youth's full loaded participation history, including other periods/programs, inactive registrations, absence and per-day check-ins. Account IDs determine identity; matching names or contact details never merge youths. Legacy rows without account IDs remain separate. The history uses administrator-authorized records already loaded by the directory; facilitator visibility remains limited to assigned activities.

Strict directory loading surfaces incomplete/failed reads and preserves the prior successful data. Profile changes update personal details without replacing historical registrations or attendance. No migration is required. Run `npm run test:participants` for history, identity separation, strict-read failures, classification and existing filters. Before live sign-off, check one youth registered in two programs across different periods, a same-named second youth, an unregistered profile, multi-day attendance, absence, and current profile edits. Confirm full history remains available while the directory is filtered and that facilitator accounts cannot retrieve unassigned participants.

### Budget monitoring

Budget Monitor combines activity-period and program filters. Overview cards show totals for the selected program or all programs, followed by individual activity cards. Totals represent recorded allocations and expenses for the selected activities, including their historical entries; they are not limited by the expense recording date. Program amounts are rollups of activity ledger allocations, not a separate program appropriation. Amounts are summed in centavos. Overview totals, activity balances and expense details use one ledger read rather than independent budget snapshots. Failed reads preserve prior data and show an error.

Negative remaining balances and utilization above 100% remain visible. Spending without allocation is displayed explicitly with utilization **N/A**; its expense detail and allocation controls remain available subject to existing database permissions and activity guards. Approved PPA plans remain separate from actual spending, and imported source allocations remain locked. No migration or attendance-flow change is required. Run `npm run test:budget` for calculations, filters, corrections/deletions and the existing approved-PPA database guards. Before live sign-off, check two programs, combined date/program filters, an expense correction/deletion, zero-allocation spending and a proposal-backed activity using authorized administrator accounts.

For the Bisaya feedback rules, semantic safeguards, regression commands and private real-feedback calibration procedure, see [Bisaya NLP](docs/bisaya-nlp.md). Numeric ratings remain separate from text sentiment; the supplied synthetic seed is development data, and the real-label template currently contains no labeled rows.

1. Install dependencies with `npm install`.
2. In the Supabase project dashboard, open **Project Settings → API** and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. Use only the project's public/anon key in the browser; never put a service-role key in a `VITE_` variable.
3. Start the app with `npm run dev`.

The app requires a configured Supabase URL and public key. Promote the designated administrator before opening administrator modules.

## Archived system workflows

- **Public activities:** Visitors can browse and filter activities, view full details, and start registration without exposing participant records.
- **Participant accounts:** Youth create an account, complete their profile, register for activities, review their registrations, and cancel while the activity's cancellation window is still open.
- **Attendance and evaluation:** Staff or assigned facilitators record attendance using a participant reference code. Participants submit an evaluation after attendance; administrators review ratings and comments.
- **Facilitator management:** Administrators create facilitator accounts and assign them to activities. Facilitators have a separate portal for their assigned activities, participants, and attendance.
- **Administrator workspace:** Administrators manage activities, participants, facilitators, attendance, and activity budgets; dashboards and reports summarize program delivery and participation.
- **Budget and reports:** Administrators record allocations and expenses and review registration, demographic, attendance, evaluation, and budget reports.

## Verification checklist

### Attendance template remark

The organization's attendance template includes a **Sex at birth** column. This field is currently missing from participant account forms and stored participant data, so the printed column remains blank for manual completion. Gender identity is not used as a substitute.

1. Check migration history and preview pending SQL before applying migrations to the linked Supabase project.
2. Promote a designated superadmin account, then create a facilitator account and assign it to an activity.
3. Create an activity and verify that its public listing and detail page show the correct schedule, venue, and capacity.
4. Register a youth account with a completed profile; verify its reference code and entry in the administrator roster.
5. Test cancellation before and after the 24-hour deadline, and confirm only eligible registrations can be cancelled.
6. Record attendance as an assigned facilitator; submit an evaluation with the participant reference code and confirm it appears in the administrator view.
7. Record an allocation and expense, then check the budget totals and report data.
8. Verify that participants cannot access administrator data and facilitators can only access activities assigned to them.

The compatibility migration leaves the existing schema in place and stores recreated-system activities separately in `legacy_activities`. Existing participant accounts with incomplete demographic details must complete their profile before registering again. Review the city's privacy, records-retention, and safeguarding requirements before deployment.
