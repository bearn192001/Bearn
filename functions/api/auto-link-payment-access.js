import { json, readJson, sameOrigin } from '../_lib.js';

async function db(env, path) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Server BEARN belum dikonfigurasi.');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json' }, cache: 'no-store'
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(data?.message || 'Gagal membaca data akses.');
  return data;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, message: 'Origin tidak diizinkan.' }, 403);
  try {
    const body = await readJson(request);
    const paymentId = String(body?.paymentId || '');
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return json({ ok: false, message: 'ID pembayaran tidak valid.' }, 400);
    const orders = await db(env, `auto_link_orders?select=id,status,auto_link_id,gross_amount&id=eq.${encodeURIComponent(paymentId)}&limit=1`);
    const order = Array.isArray(orders) ? orders[0] : null;
    if (!order || order.status !== 'paid' || Number(order.gross_amount) !== 3500) {
      return json({ ok: false, message: 'Pembayaran belum terverifikasi.' }, 403);
    }
    const links = await db(env, `auto_links?select=title,slug,destination_url,content_text,is_published,access_mode&id=eq.${encodeURIComponent(order.auto_link_id)}&limit=1`);
    const link = Array.isArray(links) ? links[0] : null;
    if (!link || !link.is_published || !['paid_direct', 'choice'].includes(link.access_mode)) {
      return json({ ok: false, message: 'Auto Link tidak aktif atau tidak ditemukan.' }, 404);
    }
    return json({ ok: true, title: link.title, slug: link.slug, content_text: link.content_text || '', destination_url: link.destination_url || null }, 200, { 'cache-control': 'no-store, private' });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Akses Auto Link gagal dimuat.' }, 400);
  }
}
