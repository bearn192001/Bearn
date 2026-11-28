import { json, readJson, sameOrigin } from '../_lib.js';

const AMOUNT = 3500;
const PLATFORM_FEE = 1500;
const CREATOR_NET = 2000;
const CASHI_URL = 'https://cashi.id';

async function db(env, path, options = {}) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Server BEARN belum dikonfigurasi (Supabase).');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(data?.message || data?.details || `Database gagal (${response.status}).`);
  return data;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, message: 'Origin tidak diizinkan.' }, 403);
  try {
    const body = await readJson(request);
    const slug = String(body?.slug || '').trim();
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(slug)) return json({ ok: false, message: 'Auto Link tidak valid.' }, 400);
    if (!env.CASHI_API_KEY) return json({ ok: false, message: 'API Key Cashi belum dipasang pada Cloudflare Pages Secrets.' }, 503);

    const links = await db(env, `auto_links?select=id,slug,is_published,access_mode&slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`, { method: 'GET' });
    const link = Array.isArray(links) ? links[0] : null;
    if (!link || !['paid_direct', 'choice'].includes(link.access_mode)) {
      return json({ ok: false, message: 'Auto Link tidak tersedia untuk akses langsung berbayar.' }, 404);
    }

    const inserted = await db(env, 'auto_link_orders', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        auto_link_id: link.id,
        gross_amount: AMOUNT,
        platform_fee: PLATFORM_FEE,
        creator_net: CREATOR_NET,
        status: 'pending',
        provider: 'CASHI'
      })
    });
    const order = Array.isArray(inserted) ? inserted[0] : null;
    if (!order?.id) throw new Error('Order pembayaran BEARN gagal dibuat. Pastikan migrasi pembayaran Auto Link sudah dijalankan.');

    const merchantOrderId = `BEARNAL-${String(order.id).replace(/-/g, '').toUpperCase()}`;
    let cashiResponse;
    try {
      // CASHI adalah kode channel QRIS Utama milik PITUCODE TECH; jangan gunakan QRIS_CUSTOM.
      const response = await fetch(`${CASHI_URL}/api/create-order`, {
        method: 'POST',
        headers: { 'x-api-key': env.CASHI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ amount: AMOUNT, order_id: merchantOrderId, kode_channel: 'CASHI' })
      });
      cashiResponse = await response.json().catch(() => ({}));
      if (!response.ok || cashiResponse?.success !== true) {
        throw new Error(cashiResponse?.message || cashiResponse?.error || `Cashi menolak pembuatan QRIS (HTTP ${response.status}).`);
      }
    } catch (error) {
      await db(env, `auto_link_orders?id=eq.${encodeURIComponent(order.id)}&status=eq.pending`, {
        method: 'PATCH', body: JSON.stringify({ status: 'failed' })
      }).catch(() => {});
      throw error;
    }

    const providerOrderId = String(cashiResponse.orderId || merchantOrderId);
    const qrUrl = typeof cashiResponse.qrUrl === 'string' ? cashiResponse.qrUrl : '';
    const checkoutUrl = typeof cashiResponse.checkout_url === 'string' ? cashiResponse.checkout_url : '';
    if (!qrUrl && !checkoutUrl) throw new Error('Cashi berhasil membuat order, tetapi respons tidak berisi qrUrl atau checkout_url.');

    await db(env, `auto_link_orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH', body: JSON.stringify({ provider_reference: providerOrderId, provider_merchant_reference: merchantOrderId })
    });

    return json({
      ok: true,
      paymentId: order.id,
      orderId: providerOrderId,
      amount: AMOUNT,
      fee: PLATFORM_FEE,
      creatorNet: CREATOR_NET,
      qrUrl,
      checkoutUrl,
      expiresAt: cashiResponse.expires_at || null
    }, 201);
  } catch (error) {
    return json({ ok: false, message: error.message || 'Gagal membuat pembayaran Auto Link.' }, 400);
  }
}
