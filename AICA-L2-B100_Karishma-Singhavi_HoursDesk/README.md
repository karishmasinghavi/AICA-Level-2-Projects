# HoursDesk — AICA Level 2, Batch 100

**Submitted by:** Karishma Singhavi  
**Project type:** Workforce time and attendance web app

HoursDesk is a responsive workspace for teams to record time, manage projects and shifts, and review leave. It is built with HTML, CSS, and JavaScript, with Supabase for authentication and data and a Vercel Function for team accounts.

## Features

- Workspace-owner sign-up, login, password reset, and private workspace data.
- Owner time clock, timesheets, shifts, corrections, time off, projects, reports, and CSV export.
- Team-member accounts created by the owner. Login details are shared manually; no invitation email is sent.
- Multiple project assignments per member. Owners can add projects to an existing account from **People → Manage projects** or **Projects → Assign member**.
- Member dashboard with project-specific work timers, live elapsed time, work history, and leave requests.
- Owner approval or rejection of member leave, with the decision and rejection reason visible to the member.
- Responsive desktop and mobile layouts.

## Set up

1. Create a [Supabase](https://supabase.com/) project. Run `supabase/schema.sql`, then `supabase/team_access.sql`, then `supabase/team_leave_requests.sql` in its SQL Editor.
2. Replace the placeholders in `src/config.js` with that project's URL and **public anon key**. Never put a database password or secret key in browser code.
3. In Supabase Authentication settings, enable email/password sign-in and configure your deployed URL as the Site URL and an allowed redirect URL.
4. In Vercel, import this folder as a project. Its build command is `npm run build` and output directory is `dist` (also set in `vercel.json`). Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as server environment variables, then deploy.
5. Create the owner account, confirm its email, sign in, and create a project. Under **People**, create a member login and assign one or more projects. Give the credentials to the intended member privately.

The server key is used only in `api/team.mjs` and is not included in this submission. The team account and work-session endpoints require the Vercel Function; a plain static server does not provide `/api/team`.

## Run and verify locally

```powershell
npm ci
npm run verify
npm run build
python -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173` for the static interface. `npm run verify` runs in-memory workflow checks and does not add sample records to Supabase.

## Scope

HoursDesk does not send invitation emails or perform payroll, GPS tracking, or leave accrual. Members use the password set by their workspace owner. Each public owner sign-up creates its own private workspace.
