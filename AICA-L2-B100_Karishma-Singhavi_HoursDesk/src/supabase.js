import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const KEY = 'hoursdesk_auth_session';
let session = JSON.parse(localStorage.getItem(KEY) || 'null');
let refreshPromise = null;
export const getSession = () => session;

async function request(path, options = {}, authorized = false, retried = false) {
  const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...options.headers };
  if (authorized) {
    if (!await ensureSession()) throw new Error('Please sign in again.');
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  let response;
  try { response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers }); }
  catch { throw new Error('Could not reach Supabase. Check your connection and try again.'); }
  const raw = await response.text();
  let body; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  if (!response.ok) {
    const tokenRejected = response.status === 401 || (path.startsWith('/auth/v1/') && response.status === 403);
    if (authorized && !retried && tokenRejected && await refreshSession()) {
      return request(path, options, true, true);
    }
    const error = new Error(body?.msg || body?.message || body?.error_description || body?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function setSession(value) {
  session = { ...value, expires_at: value.expires_at || Math.floor(Date.now()/1000) + value.expires_in };
  localStorage.setItem(KEY, JSON.stringify(session));
}

function clearSession() {
  session = null;
  localStorage.removeItem(KEY);
}

async function refreshSession() {
  if (!session?.refresh_token) return false;
  if (!refreshPromise) refreshPromise = (async () => {
    try {
      const next = await request('/auth/v1/token?grant_type=refresh_token', { method:'POST', body:JSON.stringify({ refresh_token: session.refresh_token }) });
      setSession(next);
      return true;
    } catch (error) {
      if ([400, 401, 403].includes(error.status)) { clearSession(); return false; }
      throw error;
    }
  })();
  try { return await refreshPromise; }
  finally { refreshPromise = null; }
}

export function consumeAuthRedirect() {
  const params = new URLSearchParams(location.hash.slice(1));
  const error = params.get('error_description') || params.get('error');
  if (error) { history.replaceState(null, '', location.pathname); return { error }; }
  if (!params.get('access_token')) return null;
  const token = {
    access_token: params.get('access_token'), refresh_token: params.get('refresh_token'),
    expires_in: Number(params.get('expires_in') || 3600), token_type: params.get('token_type') || 'bearer'
  };
  setSession(token);
  history.replaceState(null, '', location.pathname);
  return { success: true, type: params.get('type') };
}

export async function ensureSession() {
  if (!session) return false;
  if (session.access_token && (session.expires_at || 0) > Date.now()/1000 + 60) return true;
  if (!session.refresh_token) { clearSession(); return false; }
  return await refreshSession();
}

export async function getUser() {
  if (!await ensureSession()) return null;
  try { return await request('/auth/v1/user', {}, true); }
  catch (error) {
    if (error.status !== 401 && error.status !== 403) throw error;
    clearSession();
    return null;
  }
}

export async function signIn(email, password) {
  const result = await request('/auth/v1/token?grant_type=password', { method:'POST', body:JSON.stringify({ email, password }) });
  setSession(result); return result.user;
}

export async function signUp(email, password, fullName, company) {
  const redirect = encodeURIComponent(`${location.origin}${location.pathname}`);
  const result = await request(`/auth/v1/signup?redirect_to=${redirect}`, {
    method:'POST', body:JSON.stringify({ email, password, data:{ full_name:fullName, company } })
  });
  if (result.access_token) setSession(result);
  return result;
}

export async function sendPasswordReset(email) {
  const redirect = encodeURIComponent(`${location.origin}${location.pathname}`);
  return await request(`/auth/v1/recover?redirect_to=${redirect}`, { method:'POST', body:JSON.stringify({ email }) });
}

export async function updatePassword(password) {
  if (!await ensureSession()) throw new Error('Please sign in again.');
  return await request('/auth/v1/user', { method:'PUT', body:JSON.stringify({ password }) }, true);
}

export async function signOut() {
  if (session?.access_token) {
    try { await request('/auth/v1/logout', { method:'POST' }, true); } catch { /* clear locally even when offline */ }
  }
  clearSession();
}

export async function loadWorkspace() {
  if (!await ensureSession()) throw new Error('Please sign in again.');
  const user = await getUser();
  if (!user) throw new Error('Please sign in to continue.');
  const rows = await request(`/rest/v1/workspace_state?owner_id=eq.${encodeURIComponent(user.id)}&select=data`, {}, true);
  return rows?.[0]?.data || null;
}

export async function saveWorkspace(data) {
  if (!await ensureSession()) throw new Error('Please sign in again.');
  const user = await getUser();
  if (!user) throw new Error('Please sign in to continue.');
  await request('/rest/v1/workspace_state?on_conflict=owner_id', {
    method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
    body:JSON.stringify({ owner_id:user.id, data })
  }, true);
}

export async function teamRequest(action, body) {
  if (!await ensureSession()) throw new Error('Please sign in again.');
  const response = await fetch(`/api/team?action=${encodeURIComponent(action)}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Team request failed (${response.status})`);
  return result;
}
