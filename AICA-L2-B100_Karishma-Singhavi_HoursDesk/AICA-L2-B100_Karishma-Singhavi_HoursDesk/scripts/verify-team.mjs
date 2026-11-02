import assert from 'node:assert/strict';
import { handle } from '../api/team.mjs';
import { memberDashboard, ownerTeamPage, ownerLeaveQueue } from '../src/team-ui.js';
import { renderView } from '../src/views.js';

const owner = { id: 'owner-1' };
const member = { id: 'member-1' };
const tables = {
  workspace_state: [{ owner_id: owner.id, data: { settings: { company: 'Test workspace' }, projects: [
    { id: 'alpha', name: 'Alpha', archived: false }, { id: 'beta', name: 'Beta', archived: false },
    { id: 'hidden', name: 'Hidden', archived: true }
  ] } }],
  team_members: [], team_project_assignments: [], team_work_sessions: [], team_leave_requests: []
};
let createdPassword = '', updatedPassword = '', sentEmail = false;
const db = {
  auth: { admin: {
    async createUser({ email, password, email_confirm }) {
      assert.equal(email_confirm, true);
      createdPassword = password;
      return { data: { user: { id: member.id, email } }, error: null };
    },
    async inviteUserByEmail() { sentEmail = true; throw new Error('Email must not be sent'); },
    async updateUserById(id, { password }) { assert.equal(id, member.id); updatedPassword = password; return { error: null }; },
    async deleteUser() { return { error: null }; }
  } },
  from(name) {
    const state = { name, filters: [], mode: 'select', fields: '*', payload: null, order: null, range: null };
    const query = {
      select(fields) { state.fields = fields; return query; },
      eq(field, value) { state.filters.push(row => row[field] === value); return query; },
      is(field, value) { state.filters.push(row => row[field] === value); return query; },
      in(field, values) { state.filters.push(row => values.includes(row[field])); return query; },
      order(field, options = {}) { state.order = { field, ascending: options.ascending !== false }; return query; },
      range(start, end) { state.range = [start, end]; return query; },
      insert(payload) { state.mode = 'insert'; state.payload = payload; return query; },
      update(payload) { state.mode = 'update'; state.payload = payload; return query; },
      delete() { state.mode = 'delete'; return query; },
      async maybeSingle() { const result = await execute(); return { ...result, data: result.data[0] || null }; },
      then(resolve, reject) { return execute().then(resolve, reject); }
    };
    async function execute() {
      let rows = tables[name].filter(row => state.filters.every(check => check(row)));
      if (state.mode === 'insert') {
        const values = Array.isArray(state.payload) ? state.payload : [state.payload];
        for (const value of values) tables[name].push({ ...value,
          ...(name === 'team_members' ? { archived: false, created_at: new Date().toISOString() } : {}),
          ...(name === 'team_work_sessions' ? { id: `session-${tables[name].length + 1}`, started_at: new Date().toISOString(), stopped_at: null } : {}),
          ...(name === 'team_leave_requests' ? { id: `leave-${tables[name].length + 1}`, created_at: new Date().toISOString(), status: 'Pending', review_reason: '', reviewed_at: null } : {}) });
        return { data: values, error: null };
      }
      if (state.mode === 'update') { rows.forEach(row => Object.assign(row, state.payload)); return { data: rows, error: null }; }
      if (state.mode === 'delete') { tables[name] = tables[name].filter(row => !rows.includes(row)); return { data: rows, error: null }; }
      if (state.order) rows = rows.toSorted((a, b) => String(a[state.order.field]).localeCompare(String(b[state.order.field])) * (state.order.ascending ? 1 : -1));
      if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
      if (state.fields !== '*') rows = rows.map(row => Object.fromEntries(state.fields.split(',').map(field => [field, row[field]])));
      return { data: rows, error: null };
    }
    return query;
  }
};

async function result(user, action, body = {}) {
  const value = await handle(db, user, action, body);
  return value instanceof Response ? { status: value.status, ...await value.json() } : value;
}

let response = await result(owner, 'create', { name: 'Member', email: 'member@example.com', role: 'Developer', memberPassword: 'private-password-123', projectIds: ['alpha', 'beta'] });
assert.equal(response.members.length, 1);
assert.equal(response.assignments.length, 2);
assert.equal(createdPassword, 'private-password-123');
assert.equal(sentEmail, false);
assert.equal(JSON.stringify(tables).includes(createdPassword), false);

response = await result(member, 'member');
assert.deepEqual(response.projects.map(project => project.id), ['alpha', 'beta']);
assert.equal(response.profile.workspace, 'Test workspace');
assert.equal((await result(member, 'start', { projectId: 'hidden' })).status, 403);

response = await result(member, 'start', { projectId: 'alpha' });
assert.equal(response.sessions.length, 1);
assert.equal(response.sessions[0].stopped_at, null);
response = await result(member, 'stop');
assert.ok(response.sessions[0].stopped_at);
assert.equal(response.sessions[0].project_id, 'alpha');

response = await result(owner, 'assign', { userId: member.id, projectIds: ['beta'] });
assert.ok(response.assignments, JSON.stringify(response));
assert.deepEqual(response.assignments.map(row => row.project_id), ['beta']);
response = await result(member, 'member');
assert.deepEqual(response.projects.map(project => project.id), ['beta']);
assert.equal((await result(member, 'start', { projectId: 'alpha' })).status, 403);
response = await result(owner, 'assign', { userId: member.id, projectIds: ['beta', 'alpha'] });
assert.deepEqual(new Set(response.assignments.map(row => row.project_id)), new Set(['alpha', 'beta']));
assert.deepEqual((await result(member, 'member')).projects.map(project => project.id), ['alpha', 'beta']);
assert.equal(createdPassword, 'private-password-123');

response = await result(owner, 'reset-password', { userId: member.id, password: 'another-private-password' });
assert.equal(response.ok, true);
assert.equal(updatedPassword, 'another-private-password');
assert.equal((await result(member, 'owner')).status, 403);
assert.equal((await result(member, 'request-leave', { type: 'Vacation', from: '2026-02-30', to: '2026-03-02' })).status, 400);
response = await result(member, 'request-leave', { type: 'Vacation', from: '2026-11-10', to: '2026-11-12', note: 'Family trip' });
assert.equal(response.leaves[0].status, 'Pending');
assert.equal(response.leaves[0].note, 'Family trip');
assert.equal((await result(owner, 'review-leave', { id: response.leaves[0].id, status: 'Rejected', reason: '' })).status, 400);
response = await result(owner, 'review-leave', { id: response.leaves[0].id, status: 'Rejected', reason: 'Team coverage is unavailable.' });
assert.equal(response.leaves[0].status, 'Rejected');
assert.equal((await result(member, 'member')).leaves[0].review_reason, 'Team coverage is unavailable.');
assert.equal((await result(owner, 'review-leave', { id: response.leaves[0].id, status: 'Approved' })).status, 404);
response = await result(member, 'request-leave', { type: 'Personal', from: '2026-11-15', to: '2026-11-15' });
response = await result(owner, 'review-leave', { id: response.leaves[0].id, status: 'Approved', reason: '' });
assert.equal(response.leaves[0].status, 'Approved');
const ownerHtml = ownerTeamPage(tables.workspace_state[0].data, await result(owner, 'owner'), '');
const memberHtml = memberDashboard(await result(member, 'member'), '<span>H</span>', () => '', 'beta');
const leaveHtml = memberDashboard(await result(member, 'member'), '<span>H</span>', () => '', 'beta', 'leave');
const reviewHtml = ownerLeaveQueue(await result(owner, 'owner'));
assert.match(ownerHtml, /Reset password/);
assert.match(ownerHtml, /Manage projects/);
assert.match(ownerHtml, /Team members/);
assert.match(renderView('projects', { ...tables.workspace_state[0].data, entries: [] }, { query: '' }), /Assign member/);
assert.match(memberHtml, /Start work/);
assert.doesNotMatch(memberHtml, /Hidden/);
assert.match(leaveHtml, /Team coverage is unavailable/);
assert.match(leaveHtml, /Approved/);
assert.match(reviewHtml, /Leave for your review/);
console.log('Verified member creation, project access, work sessions, password reset, leave request, rejection reason and approval.');
