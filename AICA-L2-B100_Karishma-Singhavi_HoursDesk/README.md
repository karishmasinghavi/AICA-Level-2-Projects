# HoursDesk — AICA Level 2, Batch 100

**Submitted by:** Karishma Singhavi  
**Project type:** Workforce time and attendance web app

HoursDesk is a responsive workspace for recording work hours, planning shifts, tracking time off, and reviewing team activity. It uses Supabase email/password authentication and saves workspace data in a private database row protected by Row Level Security (RLS). The interface is built with HTML, CSS, and JavaScript and has no frontend build dependencies.

## What it does

- Sign up, confirm email, sign in, reset password, and sign out.
- Clock in and out, take breaks, and create time entries.
- Add and approve time entries; filter and export timesheets as CSV.
- Plan shifts, record leave requests, and review time corrections.
- Maintain a team directory and projects with hour budgets.
- View dashboard metrics and reports from saved records.
- Use the workspace on desktop and mobile screens.

## Set up and run locally

1. Create your own [Supabase](https://supabase.com/) project.
2. In its SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql). This creates the workspace table and owner-only RLS policies.
3. In [`src/config.js`](src/config.js), replace `YOUR_PROJECT_REF` and `YOUR_PUBLIC_ANON_KEY` with your project's URL and **public anon key** from Supabase Project Settings. Never put the database password or service-role key in this file.
4. In Supabase Authentication settings, enable email/password sign-in. Set the Site URL to `http://127.0.0.1:4173` and allow that URL for email confirmation and password recovery redirects.
5. From this folder, start a local server:

   ```powershell
   python -m http.server 4173 --bind 127.0.0.1
   ```

6. Open `http://127.0.0.1:4173`, create an account, confirm the email, then sign in. A new account starts with an empty workspace.

## Verify the project

With Node.js installed, run:

```powershell
node scripts/verify-workflows.mjs
node scripts/verify-session.mjs
```

These checks use in-memory fixtures and do not write sample records to Supabase. To assemble a static `dist/` folder for review, run `node scripts/build-static.mjs`.

## Current scope

The signed-in workspace owner manages the team directory. Adding a person creates a directory record, **not** a separate employee login. Employees cannot yet submit their own leave requests or access a personal dashboard. Invitations, manager roles, payroll, GPS, and email notifications are future work. Each separate sign-up currently creates its own private workspace.

The submission contains no Supabase password or live project key. The public anon-key placeholder must be replaced with the reviewer's own project details before using the app.
