import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => json({ error: message }, status);
const clean = (value, max = 120) => String(value || '').trim().slice(0, max);
const ids = value => [...new Set((Array.isArray(value) ? value : []).filter(x => typeof x === 'string'))];

function client() {
  if (!url || !key) throw new Error('Team access is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function caller(db, request) {
  const jwt = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) return null;
  return data.user;
}

async function ownerWorkspace(db, userId) {
  const { data, error } = await db.from('workspace_state').select('data').eq('owner_id', userId).maybeSingle();
  if (error) throw error;
  return data?.data || null;
}

async function memberRecord(db, userId) {
  const { data, error } = await db.from('team_members').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function pagedRows(db, table, column, value, fields, orderColumn) {
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await db.from(table).select(fields).eq(column, value).order(orderColumn, { ascending: false }).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function leaveRows(db, column, value, fields) {
  try { return await pagedRows(db, 'team_leave_requests', column, value, fields, 'created_at'); }
  catch (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return null;
    throw error;
  }
}

function validDate(value) {
  if (!isoDatePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

async function overview(db, ownerId) {
  const [{ data: members, error: me }, { data: assignments, error: ae }, sessions, leaves] = await Promise.all([
    db.from('team_members').select('user_id,email,name,role,department,archived,created_at').eq('owner_id', ownerId).order('created_at'),
    db.from('team_project_assignments').select('user_id,project_id').eq('owner_id', ownerId),
    pagedRows(db, 'team_work_sessions', 'owner_id', ownerId, 'id,user_id,project_id,started_at,stopped_at', 'started_at'),
    leaveRows(db, 'owner_id', ownerId, 'id,user_id,leave_type,starts_on,ends_on,note,status,review_reason,reviewed_at,created_at')
  ]);
  if (me || ae) throw me || ae;
  return { kind: 'owner', members, assignments, sessions, leaves: leaves || [], leaveReady: leaves !== null };
}

async function memberOverview(db, member) {
  if (member.archived) return { kind: 'member', profile: { name: member.name, email: member.email, role: member.role, archived: true }, projects: [], sessions: [] };
  const [{ data: assignments, error: ae }, sessions, leaves, workspace] = await Promise.all([
    db.from('team_project_assignments').select('project_id').eq('user_id', member.user_id),
    pagedRows(db, 'team_work_sessions', 'user_id', member.user_id, 'id,project_id,started_at,stopped_at', 'started_at'),
    leaveRows(db, 'user_id', member.user_id, 'id,leave_type,starts_on,ends_on,note,status,review_reason,reviewed_at,created_at'),
    ownerWorkspace(db, member.owner_id)
  ]);
  if (ae) throw ae;
  const allowed = new Set(assignments.map(x => x.project_id));
  const projects = (workspace?.projects || []).filter(p => allowed.has(p.id) && !p.archived).map(p => ({ id: p.id, name: p.name, client: p.client, description: p.description, color: p.color, budget: p.budget }));
  return { kind: 'member', profile: { name: member.name, email: member.email, role: member.role, department: member.department, workspace: workspace?.settings?.company || 'HoursDesk' }, projects, sessions, leaves: leaves || [], leaveReady: leaves !== null };
}

export async function handle(db, user, action, body) {
  const member = await memberRecord(db, user.id);
  if (action === 'identity') return member ? memberOverview(db, member) : { kind: 'owner' };
  if (member) {
    if (member.archived) return fail('Your team access has been removed.', 403);
    if (action === 'member') return memberOverview(db, member);
    if (action === 'start') {
      const projectId = clean(body.projectId, 80);
      const { data: assignment, error: ae } = await db.from('team_project_assignments').select('project_id').eq('user_id', user.id).eq('project_id', projectId).maybeSingle();
      if (ae) throw ae;
      const workspace = await ownerWorkspace(db, member.owner_id);
      if (!assignment || !(workspace?.projects || []).some(p => p.id === projectId && !p.archived)) return fail('This project is not assigned to you.', 403);
      const { error } = await db.from('team_work_sessions').insert({ user_id: user.id, owner_id: member.owner_id, project_id: projectId });
      if (error) return fail(error.code === '23505' ? 'Stop your current work session first.' : error.message, 409);
      return memberOverview(db, member);
    }
    if (action === 'stop') {
      const { data: active, error: ae } = await db.from('team_work_sessions').select('id').eq('user_id', user.id).is('stopped_at', null).maybeSingle();
      if (ae) throw ae;
      if (!active) return fail('No work session is running.');
      const { error } = await db.from('team_work_sessions').update({ stopped_at: new Date().toISOString() }).eq('id', active.id).is('stopped_at', null);
      if (error) throw error;
      return memberOverview(db, member);
    }
    if (action === 'request-leave') {
      const type = clean(body.type, 40);
      const from = clean(body.from, 10), to = clean(body.to, 10);
      const note = clean(body.note, 500);
      if (!['Vacation', 'Sick leave', 'Personal', 'Unpaid leave'].includes(type)) return fail('Choose a valid leave type.');
      if (!validDate(from) || !validDate(to) || from > to) return fail('Choose a valid start and end date.');
      const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
      if (days > 365) return fail('A leave request cannot exceed 365 days.');
      const { error } = await db.from('team_leave_requests').insert({ user_id: user.id, owner_id: member.owner_id, leave_type: type, starts_on: from, ends_on: to, note });
      if (error) throw error;
      return memberOverview(db, member);
    }
    return fail('This action is for workspace owners.', 403);
  }

  const workspace = await ownerWorkspace(db, user.id);
  if (!workspace) return fail('Workspace not found.', 404);
  if (action === 'owner') return overview(db, user.id);
  if (action === 'review-leave') {
    const id = clean(body.id, 80), status = clean(body.status, 20);
    const reason = clean(body.reason, 500);
    if (!['Approved', 'Rejected'].includes(status)) return fail('Choose Approved or Rejected.');
    if (status === 'Rejected' && !reason) return fail('Give a reason when rejecting a leave request.');
    const { data: target, error: te } = await db.from('team_leave_requests').select('id').eq('id', id).eq('owner_id', user.id).eq('status', 'Pending').maybeSingle();
    if (te) throw te;
    if (!target) return fail('Pending leave request not found.', 404);
    const { data: updated, error } = await db.from('team_leave_requests').update({ status, review_reason: reason, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', id).eq('owner_id', user.id).eq('status', 'Pending').select('id').maybeSingle();
    if (error) throw error;
    if (!updated) return fail('This request was already reviewed.', 409);
    return overview(db, user.id);
  }
  if (action === 'create') {
    const email = clean(body.email, 254).toLowerCase();
    const name = clean(body.name), role = clean(body.role), department = clean(body.department);
    const memberPassword = String(body.memberPassword || '');
    const projectIds = ids(body.projectIds);
    if (!emailPattern.test(email) || !name || !role || !projectIds.length) return fail('Enter a name, valid email, role, and at least one project.');
    if (memberPassword.length < 12 || memberPassword.length > 128) return fail('Use a password with 12 to 128 characters.');
    const allowed = new Set((workspace.projects || []).filter(p => !p.archived).map(p => p.id));
    if (projectIds.some(id => !allowed.has(id))) return fail('One of the selected projects is unavailable.');
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email, password: memberPassword, email_confirm: true,
      user_metadata: { full_name: name }, app_metadata: { hoursdesk_role: 'member' }
    });
    if (createError) return fail(createError.message, 409);
    const userId = created.user?.id;
    if (!userId) return fail('Account creation did not return a user ID.', 502);
    const { error: memberError } = await db.from('team_members').insert({ user_id: userId, owner_id: user.id, email, name, role, department });
    const { error: assignError } = memberError ? { error: null } : await db.from('team_project_assignments').insert(projectIds.map(project_id => ({ user_id: userId, owner_id: user.id, project_id })));
    if (memberError || assignError) {
      await db.auth.admin.deleteUser(userId);
      throw memberError || assignError;
    }
    return overview(db, user.id);
  }
  if (action === 'assign') {
    const userId = clean(body.userId, 80), projectIds = ids(body.projectIds);
    const { data: target, error: te } = await db.from('team_members').select('user_id').eq('owner_id', user.id).eq('user_id', userId).eq('archived', false).maybeSingle();
    if (te) throw te;
    if (!target) return fail('Team member not found.', 404);
    const allowed = new Set((workspace.projects || []).filter(p => !p.archived).map(p => p.id));
    if (projectIds.some(id => !allowed.has(id))) return fail('One of the selected projects is unavailable.');
    const { data: active, error: ae } = await db.from('team_work_sessions').select('project_id').eq('user_id', userId).is('stopped_at', null).maybeSingle();
    if (ae) throw ae;
    if (active && !projectIds.includes(active.project_id)) return fail('Stop this member’s active work session before removing its project.');
    const { data: previous, error: pe } = await db.from('team_project_assignments').select('project_id').eq('user_id', userId);
    if (pe) throw pe;
    const before = new Set(previous.map(x => x.project_id));
    const add = projectIds.filter(id => !before.has(id));
    const remove = previous.map(x => x.project_id).filter(id => !projectIds.includes(id));
    if (add.length) { const { error } = await db.from('team_project_assignments').insert(add.map(project_id => ({ user_id: userId, owner_id: user.id, project_id }))); if (error) throw error; }
    if (remove.length) { const { error } = await db.from('team_project_assignments').delete().eq('user_id', userId).in('project_id', remove); if (error) throw error; }
    return overview(db, user.id);
  }
  if (action === 'reset-password') {
    const userId = clean(body.userId, 80);
    const password = String(body.password || '');
    if (password.length < 12 || password.length > 128) return fail('Use a password with 12 to 128 characters.');
    const { data: target, error: te } = await db.from('team_members').select('user_id').eq('owner_id', user.id).eq('user_id', userId).eq('archived', false).maybeSingle();
    if (te) throw te;
    if (!target) return fail('Team member not found.', 404);
    const { error } = await db.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
    return { ok: true };
  }
  return fail('Unknown action.', 404);
}

export default {
  async fetch(request) {
    if (!['GET', 'POST'].includes(request.method)) return fail('Method not allowed.', 405);
    try {
      const db = client();
      const user = await caller(db, request);
      if (!user) return fail('Please sign in again.', 401);
      const action = new URL(request.url).searchParams.get('action') || '';
      const body = request.method === 'POST' ? await request.json() : {};
      const result = await handle(db, user, action, body);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      console.error('Team API error', error);
      return fail(error.message || 'Team service unavailable.', 500);
    }
  }
};
