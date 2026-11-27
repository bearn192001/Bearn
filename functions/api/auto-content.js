import { json, rpc, sha256, validToken } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const token = body?.token;
    if (!validToken(token)) return json({ ok: false, message: 'Token akses tidak valid.' }, 400);
    const result = await rpc(env, 'bearn_get_auto_content', { p_token_hash: await sha256(token) });
    return json({ ok: true, content_text: result?.content_text || '', destination_url: result?.destination_url || null }, 200, {
      'cache-control': 'no-store, private'
    });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Konten Auto Link tidak dapat dimuat.' }, 403);
  }
}
