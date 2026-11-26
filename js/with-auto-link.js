import { flowSlug, flowToken } from '/js/flow-session.js';

  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
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

document.addEventListener('DOMContentLoaded', async () => {
  const slug = flowSlug(), token = flowToken(slug);
  const message = document.getElementById('accessMessage');
  const content = document.getElementById('autoLinkContent');
  const button = document.getElementById('openDestination');
  if (!token) { message.textContent = 'Sesi akses tidak ditemukan. Silakan mulai kembali dari halaman Go.'; return; }
  try {
    const response = await fetch('/api/auto-content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Verifikasi akses gagal.');
    message.textContent = 'Akses berhasil. Berikut teks dan tautan yang disediakan:';
    appendLinkedText(content, String(result.content_text || ''));
    content.hidden = false;
    if (result.destination_url) {
      button.href = result.destination_url; button.target = '_blank'; button.rel = 'noopener noreferrer'; button.hidden = false;
    }
  } catch (error) { message.textContent = error.message || 'Verifikasi akses gagal.'; }
});
