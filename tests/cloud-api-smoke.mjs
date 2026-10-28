import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

class FakeD1 {
  constructor() { this.users = new Map(); this.sessions = new Map(); this.data = new Map(); this.limits = new Map(); }
  prepare(sql) { return new FakeStatement(this, sql); }
}
class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, ' ').trim(); this.params = []; }
  bind(...params) { this.params = params; return this; }
  async first() {
    const q = this.sql; const p = this.params;
    if (q.startsWith('SELECT 1 AS ok')) return { ok: 1 };
    if (q.startsWith('SELECT hit_count FROM auth_rate_limits')) return this.db.limits.get(p[0])?.window_start === p[1] ? { hit_count: this.db.limits.get(p[0]).hit_count } : null;
    if (q.startsWith('SELECT id, email, display_name, password_salt, password_hash, password_iterations, created_at FROM users WHERE email')) return [...this.db.users.values()].find(u => u.email === p[0]) || null;
    if (q.startsWith('SELECT u.id, u.email, u.display_name, u.created_at FROM sessions')) {
      const session = this.db.sessions.get(p[0]);
      if (!session || session.expires_at <= p[1]) return null;
      const user = this.db.users.get(session.user_id);
      return user ? { id:user.id,email:user.email,display_name:user.display_name,created_at:user.created_at } : null;
    }
    if (q.startsWith('SELECT data_json, updated_at FROM user_data')) return this.db.data.get(p[0]) || null;
    return null;
  }
  async run() {
    const q = this.sql; const p = this.params;
    if (q.startsWith('INSERT INTO auth_rate_limits')) {
      const [key, windowStart] = p; const old = this.db.limits.get(key);
      this.db.limits.set(key, { window_start:windowStart, hit_count:old?.window_start === windowStart ? old.hit_count + 1 : 1 });
      return { success:true };
    }
    if (q.startsWith('DELETE FROM auth_rate_limits')) { for (const [key,row] of this.db.limits) if (row.window_start < p[0]) this.db.limits.delete(key); return {success:true}; }
    if (q.startsWith('INSERT INTO users')) {
      const [id,email,display_name,password_salt,password_hash,password_iterations,created_at] = p;
      if ([...this.db.users.values()].some(user=>user.email===email)) throw new Error('UNIQUE constraint failed: users.email');
      this.db.users.set(id,{id,email,display_name,password_salt,password_hash,password_iterations,created_at}); return {success:true};
    }
    if (q.startsWith('INSERT INTO sessions')) { const [token_hash,user_id,expires_at,created_at] = p; this.db.sessions.set(token_hash,{token_hash,user_id,expires_at,created_at}); return {success:true}; }
    if (q.startsWith('DELETE FROM sessions')) { this.db.sessions.delete(p[0]); return {success:true}; }
    if (q.startsWith('INSERT INTO user_data')) { const [user_id,data_json,updated_at]=p;this.db.data.set(user_id,{data_json,updated_at});return {success:true}; }
    return { success:true };
  }
}

const db = new FakeD1();
const env = { DB: db };
const origin = 'https://fogos.example.test';
async function call(path, { method='GET', body, cookie='', ip='203.0.113.5' }={}) {
  const headers = new Headers({ Origin:origin, 'CF-Connecting-IP':ip });
  if (body !== undefined) headers.set('Content-Type','application/json');
  if (cookie) headers.set('Cookie',cookie);
  const request = new Request(`${origin}${path}`, { method, headers, ...(body !== undefined ? {body:JSON.stringify(body)} : {}) });
  const response = await onRequest({ request, env });
  const type = response.headers.get('Content-Type') || '';
  const payload = type.includes('application/json') ? await response.json() : null;
  return { response, payload };
}

const registration = await call('/api/auth/register',{method:'POST',body:{displayName:'Fog Tester',email:'Test@Example.test',password:'A-secure-test-password-1234'}});
assert.equal(registration.response.status,201,JSON.stringify(registration.payload));
assert.equal(registration.payload.user.email,'test@example.test');
const setCookie = registration.response.headers.get('Set-Cookie');
assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.match(setCookie,/SameSite=Lax/);
const cookie = setCookie.split(';')[0];
const me = await call('/api/auth/me',{cookie});
assert.equal(me.response.status,200);assert.equal(me.payload.user.displayName,'Fog Tester');
const workspace = {tasks:[{id:'t1',title:'Smoke',done:false}],notes:[],apps:[],links:[],accent:'#b8f36c',metalLevel:'medium'};
const saved = await call('/api/data',{method:'PUT',cookie,body:{data:workspace}});
assert.equal(saved.response.status,200,JSON.stringify(saved.payload));
const loaded = await call('/api/data',{cookie});
assert.deepEqual(loaded.payload.data,workspace);
const wrongLogin = await call('/api/auth/login',{method:'POST',body:{email:'test@example.test',password:'definitely-not-the-password'},ip:'203.0.113.6'});
assert.equal(wrongLogin.response.status,401);
const duplicate = await call('/api/auth/register',{method:'POST',body:{displayName:'Another',email:'test@example.test',password:'Another-secure-test-password-1234'},ip:'203.0.113.7'});
assert.equal(duplicate.response.status,409);
const loggedOut = await call('/api/auth/logout',{method:'POST',body:{},cookie});
assert.equal(loggedOut.response.status,200);
const afterLogout = await call('/api/auth/me',{cookie});
assert.equal(afterLogout.response.status,401);
const goodLogin = await call('/api/auth/login',{method:'POST',body:{email:'TEST@example.test',password:'A-secure-test-password-1234'},ip:'203.0.113.8'});
assert.equal(goodLogin.response.status,200,JSON.stringify(goodLogin.payload));
const loginCookie = goodLogin.response.headers.get('Set-Cookie').split(';')[0];
const loggedInMe = await call('/api/auth/me',{cookie:loginCookie});
assert.equal(loggedInMe.response.status,200);
const finalLogout = await call('/api/auth/logout',{method:'POST',body:{},cookie:loginCookie});
assert.equal(finalLogout.response.status,200);
console.log('FogOS Cloud API smoke checks passed: registration, secure session cookie, authenticated data sync, invalid password, logout.');
