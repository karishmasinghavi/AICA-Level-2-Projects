-- Run after schema.sql. Existing owner workspaces remain unchanged.
-- These tables are accessed only by the trusted Vercel API using a Supabase secret key.
create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null,
  department text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint team_members_not_owner check (user_id <> owner_id)
);
create index if not exists team_members_owner_idx on public.team_members(owner_id);
create unique index if not exists team_members_owner_email_idx on public.team_members(owner_id, lower(email));

create table if not exists public.team_project_assignments (
  user_id uuid not null references public.team_members(user_id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists team_assignments_owner_idx on public.team_project_assignments(owner_id);
create index if not exists team_assignments_project_idx on public.team_project_assignments(owner_id, project_id);

create table if not exists public.team_work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.team_members(user_id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_work_sessions_end_after_start check (stopped_at is null or stopped_at > started_at)
);
create index if not exists team_work_sessions_owner_started_idx on public.team_work_sessions(owner_id, started_at desc);
create index if not exists team_work_sessions_user_started_idx on public.team_work_sessions(user_id, started_at desc);
create unique index if not exists team_one_active_session_per_user on public.team_work_sessions(user_id) where stopped_at is null;

alter table public.team_members enable row level security;
alter table public.team_project_assignments enable row level security;
alter table public.team_work_sessions enable row level security;
revoke all on public.team_members, public.team_project_assignments, public.team_work_sessions from anon, authenticated;
grant all on public.team_members, public.team_project_assignments, public.team_work_sessions to service_role;
grant select on public.workspace_state to service_role;
