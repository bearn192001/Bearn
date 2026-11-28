import { flowSlug, flowToken } from '/js/flow-session.js';

function appendLinkedText(container, text) {
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  let cursor = 0, match;
  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > cursor) container.append(document.createTextNode(text.slice(cursor, match.index)));
    let raw = match[0], suffix = '';
    while (/[),.;!?]$/.test(raw)) { suffix = raw.slice(-1) + suffix; raw = raw.slice(0, -1); }
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const a = document.createElement('a');
        a.href = url.href; a.textContent = raw; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
        container.append(a, document.createTextNode(suffix));
      } else container.append(document.createTextNode(match[0]));
    } catch { container.append(document.createTextNode(match[0])); }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

async function readApiJson(response) {
  const text = await response.text();
  if (!text) throw new Error(`Server mengirim respons kosong (HTTP ${response.status}).`);
  try { return JSON.parse(text); }
  catch { throw new Error(`Respons server tidak valid (HTTP ${response.status}).`); }
}

async function showPaidAutoLink(paymentId, slug, message, content, button) {
  const response = await fetch('/api/auto-link-payment-access', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentId }), cache: 'no-store'
  });
  const result = await readApiJson(response);
  if (!response.ok || !result.ok) throw new Error(result.message || 'Pembayaran belum terverifikasi.');
  if (result.slug !== slug) throw new Error('Auto Link tidak cocok dengan transaksi pembayaran.');
  document.title = `${result.title || 'Auto Link'} — BEARN`;
  message.textContent = 'Pembayaran Rp3.500 terverifikasi. Akses Auto Link berhasil dibuka:';
  appendLinkedText(content, String(result.content_text || ''));
  content.hidden = false;
  if (result.destination_url) {
    button.href = result.destination_url; button.target = '_blank'; button.rel = 'noopener noreferrer'; button.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const paidPaymentId = params.get('paid');
  const slug = params.get('slug') || flowSlug();
  const token = flowToken(slug);
  const message = document.getElementById('accessMessage');
  const content = document.getElementById('autoLinkContent');
  const button = document.getElementById('openDestination');
  try {
    if (paidPaymentId) {
      await showPaidAutoLink(paidPaymentId, slug, message, content, button);
      return;
    }
    if (!token) { message.textContent = 'Sesi akses tidak ditemukan. Silakan mulai kembali dari halaman Go.'; return; }
    const response = await fetch('/api/auto-content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' });
    const result = await readApiJson(response);
    if (!response.ok || !result.ok) throw new Error(result.message || 'Verifikasi akses gagal.');
    message.textContent = 'Akses berhasil. Berikut teks dan tautan yang disediakan:';
    appendLinkedText(content, String(result.content_text || ''));
    content.hidden = false;
    if (result.destination_url) {
      button.href = result.destination_url; button.target = '_blank'; button.rel = 'noopener noreferrer'; button.hidden = false;
    }
  } catch (error) { message.textContent = error.message || 'Verifikasi akses gagal.'; }
});
