import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../src/supabase.js', import.meta.url), 'utf8'))
  .replace("import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';", "const SUPABASE_URL='https://example.supabase.co'; const SUPABASE_ANON_KEY='public-test-key';");
const key = 'hoursdesk_auth_session';
const expired = () => ({access_token:'old-access',refresh_token:'old-refresh',expires_at:1});
const valid = () => ({access_token:'old-access',refresh_token:'old-refresh',expires_at:Math.floor(Date.now()/1000)+3600});
const response = (status, body) => ({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)});

async function setup(initial, handler) {
  const storage = new Map([[key,JSON.stringify(initial)]]);
  globalThis.localStorage = {
    getItem: name => storage.get(name) ?? null,
    setItem: (name,value) => storage.set(name,value),
    removeItem: name => storage.delete(name)
  };
  globalThis.fetch = handler;
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${crypto.randomUUID()}`;
  return { auth:await import(url), storage };
}

let refreshes = 0;
let setupResult = await setup(expired(), async url => {
  if (url.includes('refresh_token')) { refreshes++; return response(200,{access_token:'new-access',refresh_token:'new-refresh',expires_in:3600}); }
  return response(200,{id:'owner'});
});
assert.deepEqual(await Promise.all([setupResult.auth.getUser(),setupResult.auth.getUser()]),[{id:'owner'},{id:'owner'}]);
assert.equal(refreshes,1,'concurrent calls should share one refresh');
assert.equal(JSON.parse(setupResult.storage.get(key)).refresh_token,'new-refresh');

setupResult = await setup(expired(), async () => { throw new Error('offline'); });
await assert.rejects(setupResult.auth.getUser(),/Could not reach Supabase/);
assert.ok(setupResult.storage.has(key),'an offline refresh must retain the saved session');

setupResult = await setup(expired(), async () => response(400,{error:'invalid_grant'}));
assert.equal(await setupResult.auth.getUser(),null);
assert.equal(setupResult.storage.has(key),false,'an invalid refresh token must clear the session');

let userRequests = 0;
refreshes = 0;
setupResult = await setup(valid(), async url => {
  if (url.includes('refresh_token')) { refreshes++; return response(200,{access_token:'new-access',refresh_token:'new-refresh',expires_in:3600}); }
  userRequests++;
  return userRequests===1 ? response(401,{error:'jwt expired'}) : response(200,{id:'owner'});
});
assert.deepEqual(await setupResult.auth.getUser(),{id:'owner'});
assert.equal(refreshes,1);
assert.equal(userRequests,2,'an expired token during a request should be retried once');

setupResult = await setup(valid(), async url => {
  if (url.includes('/auth/v1/user')) return response(200,{id:'owner'});
  if (url.includes('refresh_token')) throw new Error('a data permission error must not refresh auth');
  return response(403,{message:'permission denied'});
});
await assert.rejects(setupResult.auth.loadWorkspace(),/permission denied/);
assert.ok(setupResult.storage.has(key),'a workspace permission error must retain the session');

console.log('Verified session refresh, concurrent refresh, offline retention, invalid token, request retry and permission errors.');
