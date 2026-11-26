const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function rpc(env, functionName, args) {
  const baseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error('Server belum dikonfigurasi: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');

  const response = await fetch(`${baseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(args)
  });
  const body = await response.text();
  if (!response.ok) {
    let detail = body;
    try { detail = JSON.parse(body)?.message || JSON.parse(body)?.details || body; } catch {}
    throw new Error(`Supabase RPC ${functionName} gagal (${response.status}): ${detail}`);
  }
  if (!body) return null;
  try { return JSON.parse(body); } catch { return body; }
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function validToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(token);
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) throw new Error('Format request tidak valid.');
  return request.json();
}
