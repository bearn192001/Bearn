import { json, getAutoLink, verifyAccessToken } from '../_lib.js';
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderContent(content) {
  const escaped = escapeHtml(content || '').replace(/(https?:\/\/[^\s<]+?)(?=[.,!?;:]?(?:\s|$))/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return escaped.replace(/\n/g, '<br>');
}
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '').trim();
  const token = url.searchParams.get('token') || '';
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(slug) || !(await verifyAccessToken(env, token, slug))) return json({ ok: false, message: 'Token akses tidak valid atau sudah kedaluwarsa.' }, 403);
  try {
    const link = await getAutoLink(env, slug);
    if (!link) return json({ ok: false, message: 'Auto Link tidak ditemukan atau sudah tidak aktif.' }, 404);
    if (link.access_mode !== 'instant') return json({ ok: false, message: 'Metode akses ini harus menyelesaikan tahapan Tag.' }, 403);
    const content = link.content_text || link.destination_url || '';
    if (!content) return json({ ok: false, message: 'Konten Auto Link masih kosong.' }, 404);
    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(link.title || 'Auto Link')} — BEARN</title><style>body{font:16px/1.75 system-ui,sans-serif;background:#f5f6fa;color:#202333;margin:0;padding:24px}.wrap{max-width:820px;margin:5vh auto;background:white;border:1px solid #e8eaf0;border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 16px 48px #18213a12}h1{font-size:clamp(24px,4vw,34px);margin:0 0 20px}article{overflow-wrap:anywhere}a{color:#9b6900;text-decoration:underline}footer{margin-top:28px;color:#8990a0;font-size:12px}</style></head><body><main class="wrap"><h1>${escapeHtml(link.title || 'Auto Link')}</h1><article>${renderContent(content)}</article><footer>Ditampilkan melalui BEARN Auto Link</footer></main></body></html>`;
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
  } catch (error) { return json({ ok: false, message: error.message || 'Konten Auto Link tidak dapat dimuat.' }, 500); }
}
