import { json, readJson, rpc, sha256, validToken, sameOrigin } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, message: 'Origin tidak diizinkan.' }, 403);
  try {
    const body = await readJson(request);
    const stage = Number(body?.stage);
    if (!validToken(body?.token) || ![1, 2, 3].includes(stage)) {
      return json({ ok: false, message: 'Sesi atau tahap tidak valid.' }, 400);
    }
    const ok = await rpc(env, 'bearn_complete_auto_flow_stage', {
      p_token_hash: await sha256(body.token),
      p_stage: stage
    });
    if (ok !== true) return json({ ok: false, message: 'Tahap belum dapat diselesaikan. Pastikan urutannya benar dan sesi belum kedaluwarsa.' }, 409);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Gagal menyimpan tahap.' }, 400);
  }
}
