import { json, readJson, rpc, sha256, sameOrigin } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, message: 'Origin tidak diizinkan.' }, 403);
  try {
    const body = await readJson(request);
    const slug = String(body?.slug || '').trim();
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(slug)) return json({ ok: false, message: 'Slug Auto Link tidak valid.' }, 400);

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const tokenHash = await sha256(token);
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const userAgent = (request.headers.get('user-agent') || '').slice(0, 300);
    const visitorKey = await sha256(`${env.SUPABASE_SERVICE_ROLE_KEY}:${ip}:${userAgent}:${slug}`);

    await rpc(env, 'bearn_start_auto_flow', {
      p_slug: slug,
      p_token_hash: tokenHash,
      p_visitor_key: visitorKey
    });
    return json({ ok: true, token, expiresInSeconds: 3600 });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Gagal memulai sesi Auto Link.' }, 400);
  }
}
