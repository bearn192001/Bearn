import { json, readJson, getAutoLink, issueAccessToken, sameOrigin } from '../_lib.js';

const toHex = bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
async function verifyPassword(password, saltHex, expectedHex) {
  if (!saltHex || !expectedHex || !/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  const salt = Uint8Array.from(saltHex.match(/.{2}/g), x => parseInt(x, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  // Harus sama dengan pembentukan hash; batas Cloudflare Workers: 100.000 iterasi.
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const actual = toHex(bits);
  let diff = actual.length ^ expectedHex.length;
  for (let i = 0; i < Math.min(actual.length, expectedHex.length); i++) diff |= actual.charCodeAt(i) ^ expectedHex.toLowerCase().charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, message: 'Origin tidak diizinkan.' }, 403);
  try {
    const body = await readJson(request);
    const slug = String(body?.slug || '').trim();
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(slug)) return json({ ok: false, message: 'Slug Auto Link tidak valid.' }, 400);
    const link = await getAutoLink(env, slug);
    if (!link) return json({ ok: false, message: 'Auto Link tidak ditemukan atau sudah tidak aktif.' }, 404);
    if (link.password_enabled && !(await verifyPassword(password, link.password_salt, link.password_hash))) {
      return json({ ok: false, message: password ? 'Password salah. Silakan coba lagi.' : 'PASSWORD_REQUIRED' }, 401);
    }
    const accessToken = await issueAccessToken(env, slug);
    return json({ ok: true, title: link.title, access_mode: link.access_mode || 'instant', accessToken });
  } catch (error) {
    return json({ ok: false, message: error.message || 'Auto Link tidak dapat dibuka.' }, 500);
  }
}
