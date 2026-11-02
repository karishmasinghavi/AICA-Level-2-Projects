-- Run in the Supabase SQL Editor. The browser uses only the public anon key.
create table if not exists public.workspace_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);

alter table public.workspace_state enable row level security;
revoke all on public.workspace_state from anon, authenticated;
grant select, insert, update on public.workspace_state to authenticated;

drop policy if exists "Read own workspace" on public.workspace_state;
create policy "Read own workspace" on public.workspace_state
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Create own workspace" on public.workspace_state;
create policy "Create own workspace" on public.workspace_state
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "Update own workspace" on public.workspace_state;
create policy "Update own workspace" on public.workspace_state
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

