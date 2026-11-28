import { init } from '/js/core.js';
import { param, message } from '/js/flow-common.js';

async function readApiJson(response) {
  const body = await response.text();
  if (!body) throw new Error(`Server mengirim respons kosong (HTTP ${response.status}).`);
  try { return JSON.parse(body); }
  catch { throw new Error(`Respons server bukan JSON yang valid (HTTP ${response.status}).`); }
}
function safeHttpUrl(value) {
  try { const url = new URL(String(value || '').trim()); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function dropboxImageUrl(value) {
  const safe = safeHttpUrl(value);
  if (!safe) return '';
  const url = new URL(safe);
  if (['www.dropbox.com', 'dropbox.com'].includes(url.hostname)) {
    url.searchParams.delete('dl'); url.searchParams.set('raw', '1');
  }
  return url.href;
}
function makeEmptySlot(slot) {
  const panel = document.createElement('div'); panel.className = 'endorse-empty';
  const heading = document.createElement('div'); heading.className = 'endorse-heading';
  const kicker = document.createElement('span'); kicker.className = 'endorse-kicker'; kicker.textContent = 'RUANG PROMOSI';
  const title = document.createElement('strong'); title.textContent = 'Tempat promosi Anda';
  heading.append(kicker, title);
  const body = document.createElement('div'); body.className = 'endorse-empty-body';
  const copy = document.createElement('p'); copy.textContent = 'Belum ada konten promosi di area ini. Ingin produk atau layanan Anda tampil di halaman Go BEARN?';
  const link = document.createElement('a'); link.className = 'btn endorse-cta'; link.href = '/endorse.html'; link.textContent = 'Pasang Promosi';
  link.setAttribute('aria-label', `Pasang promosi pada area ${slot.dataset.endorseSlot}`);
  body.append(copy, link); panel.append(heading, body); slot.replaceChildren(panel);
}
function renderEndorseSlot(slot, item) {
  const imageUrl = dropboxImageUrl(item.image_url), targetUrl = safeHttpUrl(item.target_url);
  if (!imageUrl || !targetUrl) return makeEmptySlot(slot);
  const link = document.createElement('a'); link.className = 'endorse-image-link'; link.href = targetUrl;
  link.target = '_blank'; link.rel = 'noopener noreferrer sponsored';
  link.setAttribute('aria-label', item.alt_text || item.title || 'Buka promosi');
  const image = document.createElement('img'); image.className = 'endorse-image'; image.src = imageUrl;
  image.alt = item.alt_text || item.title || 'Promosi BEARN';
  image.loading = slot.dataset.endorseSlot === 'top' ? 'eager' : 'lazy'; image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => makeEmptySlot(slot), { once: true });
  link.append(image); slot.replaceChildren(link);
}
async function loadGoEndorseSlots() {
  const slots = [...document.querySelectorAll('[data-endorse-slot]')]; slots.forEach(makeEmptySlot);
  const client = window.BEARN?.client; if (!client) return;
  try {
    const { data, error } = await client.from('go_endorse_slots')
      .select('slot_key,title,image_url,target_url,alt_text').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) throw error;
    const rows = new Map((data || []).map(item => [item.slot_key, item]));
    slots.forEach(slot => { const item = rows.get(slot.dataset.endorseSlot); if (item) renderEndorseSlot(slot, item); });
  } catch (error) { console.warn('[BEARN Go Endorse]', error?.message || error); }
}
function passwordFeedback(text, state = 'error') {
  const target = document.getElementById('passwordMessage'); target.className = `password-feedback ${state}`; target.replaceChildren();
  if (!text) return;
  const icon = document.createElement('span'); icon.className = 'feedback-icon'; icon.setAttribute('aria-hidden', 'true');
  icon.textContent = state === 'success' ? '😊' : state === 'locked' ? '⏳' : state === 'info' ? 'ℹ️' : '⚠️';
  const copy = document.createElement('span'); copy.textContent = text; target.append(icon, copy);
}
const storageGet = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
const storageSet = (key, value) => { try { sessionStorage.setItem(key, String(value)); } catch {} };
const storageRemove = key => { try { sessionStorage.removeItem(key); } catch {} };

document.addEventListener('DOMContentLoaded', async () => {
  await init(); await loadGoEndorseSlots();
  const slug = param('slug');
  if (!slug) { message('goMessage', 'Link tidak valid.'); return; }

  const passwordCard = document.getElementById('passwordCard');
  const passwordForm = document.getElementById('passwordForm');
  const passwordInput = document.getElementById('goPassword');
  const passwordButton = passwordForm.querySelector('button');
  const paidOption = document.getElementById('paidOption');
  const freeOption = document.getElementById('freeOption');
  const instantOption = document.getElementById('instantOption');
  let accessToken = '', freeStarting = false;
  let attempts = Number(storageGet(`bearn_password_attempts_${slug}`) || 0);
  let lockUntil = Number(storageGet(`bearn_password_lock_${slug}`) || 0);
  let lockTimer = null;

  function showOptions(mode) {
    paidOption.hidden = !(mode === 'paid_direct' || mode === 'choice');
    freeOption.hidden = !(mode === 'free_tags' || mode === 'choice');
    instantOption.hidden = mode !== 'instant';
    document.getElementById('goSubtitle').textContent = 'Silakan pilih cara membukanya.';
  }
  function updateLock() {
    const left = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
    if (left > 0) {
      passwordInput.disabled = true; passwordButton.disabled = true; passwordButton.textContent = 'Tunggu…';
      passwordFeedback(`Terlalu banyak percobaan. Silakan tunggu ${left} detik sebelum memasukkan password lagi.`, 'locked');
      return true;
    }
    if (lockUntil) {
      lockUntil = 0; attempts = 0; storageSet(`bearn_password_lock_${slug}`, 0); storageSet(`bearn_password_attempts_${slug}`, 0);
      passwordInput.disabled = false; passwordButton.disabled = false; passwordButton.textContent = 'Buka Link';
      passwordFeedback('Waktu tunggu selesai. Silakan masukkan password kembali.', 'info');
    }
    return false;
  }
  function startCountdown() {
    if (lockTimer) clearInterval(lockTimer);
    const tick = () => { if (!updateLock()) { clearInterval(lockTimer); lockTimer = null; } };
    tick(); lockTimer = setInterval(tick, 1000);
  }
  async function unlock(password = '') {
    const response = await fetch('/api/auto-access', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, password }), cache: 'no-store' });
    const result = await readApiJson(response);
    if (!response.ok || !result.ok) throw new Error(result.message || 'Tidak dapat membuka Auto Link.');
    document.getElementById('goTitle').textContent = result.title || 'Auto Link';
    accessToken = result.accessToken;
    storageRemove(`bearn_password_lock_${slug}`); storageRemove(`bearn_password_attempts_${slug}`); attempts = 0;
    passwordCard.hidden = true;
    showOptions(result.access_mode || 'instant');
    const subtitle = document.getElementById('goSubtitle');
    subtitle.classList.remove('go-success');
    if (password) { subtitle.textContent = '😊 Password benar. Silakan pilih cara membukanya.'; subtitle.classList.add('go-success'); }
    if (result.access_mode === 'instant') {
      document.getElementById('instantStart').href = `/api/auto-direct?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(accessToken)}`;
    }
    if (result.access_mode === 'paid_direct' || result.access_mode === 'choice') {
      document.getElementById('paidStart').href = `/payment.html?type=auto&slug=${encodeURIComponent(slug)}`;
    }
  }

  document.getElementById('freeStart').addEventListener('click', async event => {
    event.preventDefault(); const button = event.currentTarget;
    if (freeStarting || button.getAttribute('aria-disabled') === 'true') return;
    freeStarting = true; button.setAttribute('aria-disabled', 'true'); button.textContent = 'Menyiapkan sesi…';
    try {
      const response = await fetch('/api/flow-start', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, accessToken }), cache: 'no-store' });
      const result = await readApiJson(response);
      if (!response.ok || !result.ok || !result.token) throw new Error(result.message || 'Gagal memulai sesi.');
      sessionStorage.setItem(`bearn_flow_token_${slug}`, result.token);
      location.href = `/tag-1.html?slug=${encodeURIComponent(slug)}`;
    } catch (error) {
      message('goMessage', error.message || 'Gagal memulai sesi.'); button.removeAttribute('aria-disabled');
      button.textContent = 'Lanjutkan dengan Free'; freeStarting = false;
    }
  });

  passwordForm.addEventListener('submit', async event => {
    event.preventDefault(); if (updateLock()) return;
    const password = passwordInput.value;
    if (!password) { passwordFeedback('Password wajib diisi.', 'error'); passwordInput.focus(); return; }
    passwordButton.disabled = true; passwordInput.disabled = true; passwordButton.textContent = 'Memeriksa…';
    try {
      await unlock(password);
      passwordFeedback('Password benar. Silakan pilih cara membukanya.', 'success');
    } catch (error) {
      if (/password salah/i.test(String(error.message))) {
        attempts += 1; storageSet(`bearn_password_attempts_${slug}`, attempts);
        if (attempts >= 5) {
          lockUntil = Date.now() + 60_000; storageSet(`bearn_password_lock_${slug}`, lockUntil); startCountdown();
        } else {
          passwordInput.disabled = false; passwordButton.disabled = false; passwordButton.textContent = 'Coba Lagi';
          passwordFeedback(`Password salah. Percobaan ${attempts} dari 5. Setelah lima kali salah, akses input dikunci selama satu menit.`, 'error');
          passwordInput.select();
        }
      } else {
        passwordInput.disabled = false; passwordButton.disabled = false; passwordButton.textContent = 'Buka Link';
        passwordFeedback(error.message || 'Password tidak dapat diverifikasi.', 'error');
      }
    }
  });

  if (lockUntil > Date.now()) startCountdown();
  try { await unlock(''); }
  catch (error) {
    if (String(error.message).includes('PASSWORD_REQUIRED')) {
      passwordCard.hidden = false;
      document.getElementById('goSubtitle').textContent = 'Link ini dilindungi password. Silakan masukkan password untuk memilih cara membukanya.';
      if (!updateLock()) passwordInput.focus();
    } else message('goMessage', error.message || 'Auto Link tidak dapat dibuka.');
  }
});
