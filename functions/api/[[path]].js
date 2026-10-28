const SESSION_COOKIE = '__Host-fogos_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
// Keep this within the Web Crypto/CPU budget for a low-cost Cloudflare Worker.
const PBKDF2_ITERATIONS = 30000;
const MAX_BODY_BYTES = 700_000;
const encoder = new TextEncoder();

function json(body, status = 200, headers = new Headers()) {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(JSON.stringify(body), { status, headers });
}

function corsHeaders(request, env) {
  const headers = new Headers();
  const origin = request.headers.get('Origin');
  const sameOrigin = new URL(request.url).origin;
  const allowed = new Set([sameOrigin, ...(env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean)]);
  const allowedOrigin = !origin || allowed.has(origin);
  if (origin && allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return { headers, allowedOrigin, origin, sameOrigin };
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromBase64Url(value) {
  const standard = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = standard + '='.repeat((4 - standard.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function digest(value) {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromBase64Url(salt), iterations, hash: 'SHA-256' }, key, 256);
  return toBase64Url(new Uint8Array(bits));
}
function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) mismatch |= (a[i % (a.length || 1)] || 0) ^ (b[i % (b.length || 1)] || 0);
  return mismatch === 0;
}
function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return toBase64Url(value);
}
function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const item of raw.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim();
  }
  return '';
}
function sessionCookie(request, token, maxAge, sameOrigin) {
  const sameSite = sameOrigin ? 'Lax' : 'None';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}`;
}
function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
}
async function readJson(request, maxBytes = 16_384) {
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > maxBytes) fail(413, 'La richiesta è troppo grande.');
  try { return JSON.parse(raw); } catch { fail(400, 'Il corpo della richiesta non è un JSON valido.'); }
}
async function rateLimit(request, env, scope) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown-ip';
  const key = `${scope}:${await digest(ip)}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / 900) * 900;
  await env.DB.prepare(`INSERT INTO auth_rate_limits (key, window_start, hit_count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      hit_count = CASE WHEN auth_rate_limits.window_start = excluded.window_start THEN auth_rate_limits.hit_count + 1 ELSE 1 END,
      window_start = excluded.window_start`).bind(key, windowStart).run();
  const row = await env.DB.prepare('SELECT hit_count FROM auth_rate_limits WHERE key = ? AND window_start = ?').bind(key, windowStart).first();
  if (Number(row?.hit_count || 0) > 10) fail(429, 'Troppe richieste. Riprova tra qualche minuto.');
  // Keep the rate-limit table bounded without tracking raw IP addresses.
  if (now % 60 < 2) await env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(now - 86_400).run();
}
async function authenticate(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) fail(401, 'Accedi per continuare.');
  const tokenHash = await digest(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.display_name, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`).bind(tokenHash, now).first();
  if (!row) fail(401, 'Sessione scaduta. Accedi di nuovo.');
  return row;
}
async function createSession(request, env, user, cors) {
  const token = randomToken(32);
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await digest(token), user.id, expires, Math.floor(Date.now() / 1000)).run();
  cors.headers.append('Set-Cookie', sessionCookie(request, token, SESSION_TTL_SECONDS, cors.origin === cors.sameOrigin || !cors.origin));
}
function clearSessionCookie(request, cors) {
  cors.headers.append('Set-Cookie', sessionCookie(request, '', 0, cors.origin === cors.sameOrigin || !cors.origin));
}
function methodOnly(request, expected) {
  if (request.method !== expected) fail(405, `Metodo non consentito. Usa ${expected}.`);
}
function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validWorkspace(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  for (const key of ['tasks', 'notes', 'apps', 'links']) {
    if (!Array.isArray(data[key]) || data[key].length > 1000) return false;
  }
  return true;
}

export async function onRequest({ request, env }) {
  const cors = corsHeaders(request, env);
  if (!cors.allowedOrigin) return json({ error: 'Origine non autorizzata.' }, 403, cors.headers);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers });
  if (!env.DB) return json({ error: 'Database non configurato: collega un database D1 al binding DB.' }, 503, cors.headers);

  const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
  const route = pathname.startsWith('/api/') ? pathname.slice('/api/'.length) : '';

  try {
    if (route === 'health') {
      methodOnly(request, 'GET');
      await env.DB.prepare('SELECT 1 AS ok').first();
      return json({ ok: true, auth: true, service: 'FogOS Cloud API' }, 200, cors.headers);
    }

    if (route === 'auth/register') {
      methodOnly(request, 'POST');
      await rateLimit(request, env, 'register');
      const body = await readJson(request);
      const email = String(body.email || '').trim().toLowerCase();
      const displayName = String(body.displayName || '').trim();
      const password = typeof body.password === 'string' ? body.password : '';
      if (!validEmail(email)) fail(400, 'Inserisci un indirizzo email valido.');
      if (displayName.length < 1 || displayName.length > 48) fail(400, 'Il nome deve contenere da 1 a 48 caratteri.');
      if (password.length < 12 || password.length > 128) fail(400, 'La password deve contenere da 12 a 128 caratteri.');
      const salt = randomToken(16);
      const passwordHash = await hashPassword(password, salt);
      const user = { id: crypto.randomUUID(), email, displayName, createdAt: new Date().toISOString() };
      try {
        await env.DB.prepare('INSERT INTO users (id, email, display_name, password_salt, password_hash, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(user.id, user.email, user.displayName, salt, passwordHash, PBKDF2_ITERATIONS, user.createdAt).run();
      } catch (error) {
        if (/unique|constraint/i.test(String(error?.message || error))) fail(409, 'Esiste già un account con questa email. Prova ad accedere.');
        throw error;
      }
      await createSession(request, env, { id: user.id }, cors);
      return json({ ok: true, user }, 201, cors.headers);
    }

    if (route === 'auth/login') {
      methodOnly(request, 'POST');
      await rateLimit(request, env, 'login');
      const body = await readJson(request);
      const email = String(body.email || '').trim().toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      if (!validEmail(email) || password.length < 1 || password.length > 128) fail(400, 'Inserisci email e password valide.');
      const row = await env.DB.prepare('SELECT id, email, display_name, password_salt, password_hash, password_iterations, created_at FROM users WHERE email = ? LIMIT 1').bind(email).first();
      if (!row) {
        // Perform a dummy derivation so unknown addresses are not an immediate fast path.
        await hashPassword(password, 'AAAAAAAAAAAAAAAAAAAAAA', PBKDF2_ITERATIONS);
        fail(401, 'Email o password non corrette.');
      }
      const suppliedHash = await hashPassword(password, row.password_salt, Number(row.password_iterations) || PBKDF2_ITERATIONS);
      if (!constantTimeEqual(suppliedHash, row.password_hash)) fail(401, 'Email o password non corrette.');
      await createSession(request, env, row, cors);
      return json({ ok: true, user: publicUser(row) }, 200, cors.headers);
    }

    if (route === 'auth/me') {
      methodOnly(request, 'GET');
      const user = await authenticate(request, env);
      return json({ ok: true, user: publicUser(user) }, 200, cors.headers);
    }

    if (route === 'auth/logout') {
      methodOnly(request, 'POST');
      const token = readCookie(request, SESSION_COOKIE);
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(token)).run();
      clearSessionCookie(request, cors);
      return json({ ok: true }, 200, cors.headers);
    }

    if (route === 'data') {
      const user = await authenticate(request, env);
      if (request.method === 'GET') {
        const row = await env.DB.prepare('SELECT data_json, updated_at FROM user_data WHERE user_id = ?').bind(user.id).first();
        return json({ ok: true, data: row ? JSON.parse(row.data_json) : null, updatedAt: row?.updated_at || null }, 200, cors.headers);
      }
      if (request.method === 'PUT') {
        const body = await readJson(request, MAX_BODY_BYTES);
        const data = body?.data;
        if (!validWorkspace(data)) fail(400, 'Il workspace non contiene le liste richieste o supera il limite.');
        const serialized = JSON.stringify(data);
        if (encoder.encode(serialized).byteLength > MAX_BODY_BYTES) fail(413, 'Il workspace è troppo grande. Esporta un backup e riduci gli allegati/testi.');
        const updatedAt = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO user_data (user_id, data_json, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
          .bind(user.id, serialized, updatedAt).run();
        return json({ ok: true, updatedAt }, 200, cors.headers);
      }
      fail(405, 'Metodo non consentito. Usa GET o PUT.');
    }

    return json({ error: 'Endpoint non trovato.' }, 404, cors.headers);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('FogOS API error:', error?.stack || error);
    return json({ error: status >= 500 ? 'Errore del servizio. Verifica il database D1 e riprova.' : String(error.message || 'Richiesta non valida.') }, status, cors.headers);
  }
}
