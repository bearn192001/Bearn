import { json } from '../_lib.js';

function toHex(bytes) { return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join(''); }
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifySignature(payload, signature, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, payload);
  return safeEqual(toHex(digest), String(signature || '').trim().toLowerCase());
}
async function db(env, path, options = {}) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Supabase server config missing.');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json', ...(options.headers || {}) }
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(data?.message || data?.details || `Database error (${response.status}).`);
  return data;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.CASHI_WEBHOOK_SECRET) return json({ ok: false, message: 'Webhook secret belum dikonfigurasi.' }, 503);
    const raw = await request.arrayBuffer();
    const signature = request.headers.get('x-gateway-signature') || '';
    if (!signature || !(await verifySignature(raw, signature, env.CASHI_WEBHOOK_SECRET))) {
      return json({ ok: false, message: 'Invalid signature.' }, 401);
    }
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(raw)); }
    catch { return json({ ok: false, message: 'Invalid JSON.' }, 400); }
    if (payload?.event !== 'PAYMENT_SETTLED') return json({ ok: true, ignored: true });
    const data = payload?.data || {};
    if (String(data.status || '').toUpperCase() !== 'SETTLED') return json({ ok: true, ignored: true });
    const orderId = String(data.order_id || '').trim();
    if (!orderId) return json({ ok: false, message: 'Missing order_id.' }, 400);

    let rows = await db(env, `auto_link_orders?select=id,gross_amount,status,provider&provider_reference=eq.${encodeURIComponent(orderId)}&limit=1`, { method: 'GET' });
    let order = Array.isArray(rows) ? rows[0] : null;
    if (!order) {
      rows = await db(env, `auto_link_orders?select=id,gross_amount,status,provider&provider_merchant_reference=eq.${encodeURIComponent(orderId)}&limit=1`, { method: 'GET' });
      order = Array.isArray(rows) ? rows[0] : null;
    }
    if (!order || order.provider !== 'CASHI' || Number(order.gross_amount) !== 3500) {
      // Order yang bukan milik Auto Link BEARN tidak boleh dikreditkan oleh webhook ini.
      return json({ ok: true, ignored: true });
    }
    if (order.status !== 'paid') {
      await db(env, `auto_link_orders?id=eq.${encodeURIComponent(order.id)}&status=eq.pending`, {
        method: 'PATCH', body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() })
      });
    }
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Webhook processing failed.' }, 500);
  }
}
