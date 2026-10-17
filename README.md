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

## Run locally

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

1. Check migration history and preview pending SQL before applying migrations to the linked Supabase project.
2. Promote a designated superadmin account, then create a facilitator account and assign it to an activity.
3. Create an activity and verify that its public listing and detail page show the correct schedule, venue, and capacity.
4. Register a youth account with a completed profile; verify its reference code and entry in the administrator roster.
5. Test cancellation before and after the 24-hour deadline, and confirm only eligible registrations can be cancelled.
6. Record attendance as an assigned facilitator; submit an evaluation with the participant reference code and confirm it appears in the administrator view.
7. Record an allocation and expense, then check the budget totals and report data.
8. Verify that participants cannot access administrator data and facilitators can only access activities assigned to them.

The compatibility migration leaves the existing schema in place and stores recreated-system activities separately in `legacy_activities`. Existing participant accounts with incomplete demographic details must complete their profile before registering again. Review the city's privacy, records-retention, and safeguarding requirements before deployment.
