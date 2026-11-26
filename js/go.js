import { init } from '/js/core.js';
import { param, message, money } from '/js/flow-common.js';

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  const slug = param('slug');
  const client = window.BEARN?.client;
  if (!slug || !client) {
    message('goMessage', 'Link tidak valid atau database belum dikonfigurasi.');
    return;
  }
  const { data, error } = await client.from('auto_links')
    .select('title,access_mode,price,is_published').eq('slug', slug).maybeSingle();
  if (error || !data || !data.is_published) {
    message('goMessage', 'Auto Link tidak ditemukan atau sudah tidak aktif.');
    return;
  }

  document.getElementById('goTitle').textContent = data.title;
  const free = document.getElementById('freeStart');
  const paid = document.getElementById('paidStart');
  if (data.access_mode === 'paid_direct') {
    free.hidden = true;
    paid.href = `/payment.html?type=auto&slug=${encodeURIComponent(slug)}`;
    paid.textContent = `Bayar ${money(3500)}`;
  } else {
    paid.hidden = true;
    free.href = '#';
    let starting = false;
    free.addEventListener('click', async event => {
      event.preventDefault();
      if (starting) return;
      starting = true;
      free.setAttribute('aria-disabled', 'true');
      free.textContent = 'Menyiapkan sesi…';
      try {
        const response = await fetch('/api/flow-start', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug }), cache: 'no-store'
        });
        const result = await response.json();
        if (!response.ok || !result.ok || !result.token) throw new Error(result.message || 'Gagal memulai sesi.');
        sessionStorage.setItem(`bearn_flow_token_${slug}`, result.token);
        location.href = `/tag-1.html?slug=${encodeURIComponent(slug)}`;
      } catch (err) {
        message('goMessage', err.message || 'Sesi tidak dapat dibuat. Coba lagi.');
        free.removeAttribute('aria-disabled');
        free.textContent = 'Mulai Gratis';
        starting = false;
      }
    });
  }
});
