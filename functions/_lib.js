const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

export async function rpc(env, functionName, args) {
  const baseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error('Server belum dikonfigurasi: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(args)
  });
  const body = await response.text();
  if (!response.ok) {
    let detail = body;
    try { const parsed = JSON.parse(body); detail = parsed.message || parsed.details || body; } catch {}
    throw new Error(`Supabase RPC ${functionName} gagal (${response.status}): ${detail}`);
  }
  if (!body) return null;
  try { return JSON.parse(body); } catch { return body; }
}

export async function getAutoLink(env, slug) {
  const baseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error('Server belum dikonfigurasi: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  const url = new URL(`${baseUrl}/rest/v1/auto_links`);
  url.searchParams.set('select', 'title,slug,destination_url,content_text,access_mode,is_published,password_enabled,password_salt,password_hash');
  url.searchParams.set('slug', `eq.${slug}`);
  url.searchParams.set('is_published', 'eq.true');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json' } });
  const body = await response.text();
  if (!response.ok) {
    let detail = body;
    try { const parsed = JSON.parse(body); detail = parsed.message || parsed.details || body; } catch {}
    throw new Error(`Gagal membaca Auto Link dari database (${response.status}): ${detail}`);
  }
  let rows;
  try { rows = JSON.parse(body || '[]'); } catch { throw new Error('Respons database Auto Link bukan JSON yang valid.'); }
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function validToken(token) { return typeof token === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(token); }
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
export async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) throw new Error('Format request tidak valid.');
  try { return await request.json(); } catch { throw new Error('Data permintaan kosong atau JSON tidak valid.'); }
}

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
async function hmacKey(secret) { return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function issueAccessToken(env, slug, ttlSeconds = 3600) {
  const secret = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Kunci server belum dikonfigurasi.');
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ slug, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${b64url(signature)}`;
}
export async function verifyAccessToken(env, token, slug) {
  try {
    if (typeof token !== 'string' || token.length > 1000) return false;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return false;
    const secret = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return false;
    const raw = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((signature.length + 3) % 4)), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), raw, new TextEncoder().encode(payload));
    if (!valid) return false;
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((payload.length + 3) % 4));
    const data = JSON.parse(decoded);
    return data.slug === slug && Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
