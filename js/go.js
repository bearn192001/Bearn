import { init } from '/js/core.js';
import { param, message } from '/js/flow-common.js';

async function readApiJson(response) {
  const text = await response.text();
  if (!text) throw new Error(`Server mengirim respons kosong (HTTP ${response.status}). Periksa konfigurasi Cloudflare Functions.`);
  try { return JSON.parse(text); }
  catch { throw new Error(`Respons server bukan JSON yang valid (HTTP ${response.status}). Periksa endpoint API Auto Link.`); }
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function dropboxImageUrl(value) {
  const safe = safeHttpUrl(value);
  if (!safe) return '';
  try {
    const url = new URL(safe);
    if (url.hostname === 'www.dropbox.com' || url.hostname === 'dropbox.com') {
      url.searchParams.delete('dl');
      url.searchParams.set('raw', '1');
      return url.href;
    }
    return safe;
  } catch { return ''; }
}

function makeEmptySlot(slot, position) {
  const card = document.createElement('div');
  card.className = 'endorse-empty';
  const tag = document.createElement('span');
  tag.className = 'endorse-label';
  tag.textContent = 'BEARN PROMOTION';
  const title = document.createElement('strong');
  title.textContent = 'Slot iklan kosong';
  const copy = document.createElement('p');
  copy.textContent = 'Ingin mempromosikan produk atau brand Anda? Pasang iklan endorse di BEARN.';
  const link = document.createElement('a');
  link.className = 'btn endorse-cta';
  link.href = '/endorse.html';
  link.textContent = 'Promosi Sekarang';
  link.setAttribute('aria-label', `Promosi sekarang pada slot ${position}`);
  card.append(tag, title, copy, link);
  slot.replaceChildren(card);
}

function renderEndorseSlot(slot, item) {
  const imageUrl = dropboxImageUrl(item.image_url);
  const targetUrl = safeHttpUrl(item.target_url);
  if (!imageUrl || !targetUrl) {
    makeEmptySlot(slot, slot.dataset.endorseSlot);
    return;
  }

  const link = document.createElement('a');
  link.className = 'endorse-image-link';
  link.href = targetUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer sponsored';
  link.setAttribute('aria-label', item.alt_text || item.title || 'Buka iklan endorse');

  const image = document.createElement('img');
  image.className = 'endorse-image';
  image.src = imageUrl;
  image.alt = item.alt_text || item.title || 'Iklan endorse BEARN';
  image.loading = slot.dataset.endorseSlot === 'top' ? 'eager' : 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => makeEmptySlot(slot, slot.dataset.endorseSlot), { once: true });
  link.append(image);
  slot.replaceChildren(link);
}

async function loadGoEndorseSlots() {
  const slots = [...document.querySelectorAll('[data-endorse-slot]')];
  slots.forEach(slot => makeEmptySlot(slot, slot.dataset.endorseSlot));
  const client = window.BEARN?.client;
  if (!client) return;

  try {
    const { data, error } = await client
      .from('go_endorse_slots')
      .select('slot_key,title,image_url,target_url,alt_text')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    const byPosition = new Map((data || []).map(item => [item.slot_key, item]));
    slots.forEach(slot => {
      const item = byPosition.get(slot.dataset.endorseSlot);
      if (item) renderEndorseSlot(slot, item);
    });
  } catch (error) {
    // Slot kosong tetap tampil jika migrasi belum dijalankan atau data iklan belum dibuat.
    console.warn('[BEARN Go Endorse]', error?.message || error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  await loadGoEndorseSlots();

  const slug = param('slug');
  if (!slug) {
    message('goMessage', 'Link tidak valid.');
    return;
  }

  const passwordCard = document.getElementById('passwordCard');
  const accessCard = document.getElementById('accessCard');
  const passwordForm = document.getElementById('passwordForm');
  const passwordInput = document.getElementById('goPassword');
  let accessToken = '';
  let freeStarting = false;

  async function unlock(password = '') {
    const response = await fetch('/api/auto-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, password }),
      cache: 'no-store'
    });
    const result = await readApiJson(response);
    if (!response.ok || !result.ok) throw new Error(result.message || 'Tidak dapat membuka Auto Link.');

    document.getElementById('goTitle').textContent = result.title || 'Auto Link';
    accessToken = result.accessToken;
    passwordCard.hidden = true;
    accessCard.hidden = true;

    const mode = result.access_mode;
    const show = (id, visible) => { document.getElementById(id).hidden = !visible; };
    show('instantOption', mode === 'instant');
    show('freeOption', mode === 'free_tags' || mode === 'choice');
    show('paidOption', mode === 'paid_direct' || mode === 'choice');
    accessCard.hidden = false;

    if (mode === 'instant') {
      const direct = document.getElementById('instantStart');
      direct.href = `/api/auto-direct?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(accessToken)}`;
    }
    if (mode === 'paid_direct' || mode === 'choice') {
      document.getElementById('paidStart').href = `/payment.html?type=auto&slug=${encodeURIComponent(slug)}`;
    }
  }

  document.getElementById('freeStart').addEventListener('click', async event => {
    event.preventDefault();
    const free = event.currentTarget;
    if (freeStarting || free.getAttribute('aria-disabled') === 'true') return;
    freeStarting = true;
    free.setAttribute('aria-disabled', 'true');
    free.textContent = 'Menyiapkan sesi…';
    try {
      const response = await fetch('/api/flow-start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, accessToken }),
        cache: 'no-store'
      });
      const payload = await readApiJson(response);
      if (!response.ok || !payload.ok || !payload.token) throw new Error(payload.message || 'Gagal memulai sesi.');
      sessionStorage.setItem(`bearn_flow_token_${slug}`, payload.token);
      location.href = `/tag-1.html?slug=${encodeURIComponent(slug)}`;
    } catch (error) {
      message('goMessage', error.message || 'Gagal memulai sesi.');
      free.removeAttribute('aria-disabled');
      free.textContent = 'Lanjut dengan Free';
      freeStarting = false;
    }
  });

  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = passwordForm.querySelector('button');
    button.disabled = true;
    button.textContent = 'Memeriksa…';
    try {
      await unlock(passwordInput.value);
      message('passwordMessage', '');
    } catch (error) {
      message('passwordMessage', error.message || 'Password salah.');
      button.disabled = false;
      button.textContent = 'Buka Link';
      passwordInput.select();
    }
  });

  try {
    await unlock('');
  } catch (error) {
    if (String(error.message).includes('PASSWORD_REQUIRED')) {
      passwordCard.hidden = false;
      document.getElementById('goSubtitle').textContent = 'Link ini dilindungi password. Masukkan password untuk melanjutkan.';
      passwordInput.focus();
    } else {
      message('goMessage', error.message || 'Auto Link tidak dapat dibuka.');
    }
  }
});
