-- Run once in the Supabase SQL Editor after team_access.sql.
-- Team leave is accessed only through the trusted Vercel API.
create table if not exists public.team_leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.team_members(user_id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  leave_type text not null check (leave_type in ('Vacation', 'Sick leave', 'Personal', 'Unpaid leave')),
  starts_on date not null,
  ends_on date not null,
  note text not null default '',
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  review_reason text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_leave_date_order check (ends_on >= starts_on),
  constraint team_leave_review_consistency check (
    (status = 'Pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'Pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists team_leave_owner_status_idx
  on public.team_leave_requests(owner_id, status, created_at desc);
create index if not exists team_leave_member_created_idx
  on public.team_leave_requests(user_id, created_at desc);

alter table public.team_leave_requests enable row level security;
revoke all on public.team_leave_requests from anon, authenticated;
grant all on public.team_leave_requests to service_role;
