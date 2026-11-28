import { json, readJson, sameOrigin } from '../_lib.js';

async function db(env, path, options = {}) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Server BEARN belum dikonfigurasi (Supabase).');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json', ...(options.headers || {}) }
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(data?.message || data?.details || `Database gagal (${response.status}).`);
  return data;
}

async function markPaid(env, order) {
  await db(env, `auto_link_orders?id=eq.${encodeURIComponent(order.id)}&status=eq.pending`, {
    method: 'PATCH', body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() })
  });
  const refreshed = await db(env, `auto_link_orders?select=status&id=eq.${encodeURIComponent(order.id)}&limit=1`, { method: 'GET' });
  return refreshed?.[0]?.status || 'pending';
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, message: 'Origin tidak diizinkan.' }, 403);
  try {
    const body = await readJson(request);
    const paymentId = String(body?.paymentId || '');
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return json({ ok: false, message: 'ID pembayaran tidak valid.' }, 400);
    if (!env.CASHI_API_KEY) return json({ ok: false, message: 'API Key Cashi belum dikonfigurasi.' }, 503);
    const rows = await db(env, `auto_link_orders?select=id,gross_amount,status,provider,provider_reference,provider_merchant_reference&id=eq.${encodeURIComponent(paymentId)}&limit=1`, { method: 'GET' });
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order || order.provider !== 'CASHI' || Number(order.gross_amount) !== 3500 || !order.provider_reference) {
      return json({ ok: false, message: 'Transaksi tidak ditemukan atau tidak valid.' }, 404);
    }
    if (order.status === 'paid') return json({ ok: true, status: 'paid' });
    if (['expired', 'failed', 'refunded'].includes(order.status)) return json({ ok: true, status: order.status });

    const references = [...new Set([order.provider_reference, order.provider_merchant_reference].filter(Boolean))];
    let response = null, gateway = null;
    for (const reference of references) {
      response = await fetch(`https://cashi.id/api/check-status/${encodeURIComponent(reference)}`, {
        method: 'GET', headers: { 'x-api-key': env.CASHI_API_KEY, accept: 'application/json' }, cache: 'no-store'
      });
      gateway = await response.json().catch(() => ({}));
      if (response.ok && gateway?.success !== false) break;
    }
    if (!response?.ok || gateway?.success === false) {
      return json({ ok: true, status: 'pending', message: 'Status gateway belum tersedia.' });
    }
    const gatewayData = gateway?.data || gateway;
    const status = String(gatewayData?.status || '').toUpperCase();
    const returnedOrderId = String(gatewayData?.order_id || gatewayData?.orderId || '');
    if (returnedOrderId && !references.includes(returnedOrderId)) return json({ ok: false, message: 'Referensi transaksi gateway tidak cocok.' }, 409);

    if (status === 'SETTLED') {
      const finalStatus = await markPaid(env, order);
      return json({ ok: true, status: finalStatus === 'paid' ? 'paid' : 'pending' });
    }
    if (status === 'EXPIRED' || status === 'FAILED' || status === 'CANCELLED') {
      await db(env, `auto_link_orders?id=eq.${encodeURIComponent(order.id)}&status=eq.pending`, {
        method: 'PATCH', body: JSON.stringify({ status: status === 'EXPIRED' ? 'expired' : 'failed' })
      });
      return json({ ok: true, status: status === 'EXPIRED' ? 'expired' : 'failed' });
    }
    return json({ ok: true, status: 'pending' });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Gagal memeriksa status pembayaran.' }, 400);
  }
}
