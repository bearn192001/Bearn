import { json, rpc, sha256, validToken } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  if (!validToken(token)) return json({ ok: false, message: 'Token akses tidak valid.' }, 400);
  try {
    const result = await rpc(env, 'bearn_finalize_auto_flow', { p_token_hash: await sha256(token) });
    const destination = new URL(result?.destination_url || '');
    if (!['http:', 'https:'].includes(destination.protocol)) {
      return json({ ok: false, message: 'URL tujuan tidak valid.' }, 502);
    }
    return new Response(null, {
      status: 302,
      headers: {
        location: destination.href,
        'cache-control': 'no-store, private',
        'referrer-policy': 'no-referrer'
      }
    });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Verifikasi gagal. Silakan ulangi dari awal.' }, 403);
  }
}
