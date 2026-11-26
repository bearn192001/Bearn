import { json, readJson, rpc, sha256, validToken, sameOrigin } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, message: 'Origin tidak diizinkan.' }, 403);
  try {
    const body = await readJson(request);
    if (!validToken(body?.token)) return json({ ok: false, message: 'Sesi tidak ditemukan.' }, 400);
    const status = await rpc(env, 'bearn_get_auto_flow_status', { p_token_hash: await sha256(body.token) });
    return json({ ok: true, status });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Gagal memeriksa sesi.' }, 400);
  }
}
