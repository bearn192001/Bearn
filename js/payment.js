import { init } from '/js/core.js';
import { param, message, money } from '/js/flow-common.js';

const byId = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function readJson(response) {
  const raw = await response.text();
  try { return JSON.parse(raw); }
  catch { throw new Error(`Respons server tidak valid (HTTP ${response.status}).`); }
}

function show(el) { if (el) el.hidden = false; }
function hide(el) { if (el) el.hidden = true; }

async function initAutoCheckout(slug) {
  show(byId('autoCheckout'));
  const startButton = byId('startPremiumPayment');
  const initial = byId('autoCheckout');
  const processing = byId('paymentProcessing');
  const qris = byId('qrisCheckout');
  const statusMessage = byId('qrisMessage');
  let orderId = null, statusTimer = null, checking = false;

  async function checkStatus(manual = false) {
    if (!orderId || checking) return;
    checking = true;
    const button = byId('checkPayment');
    if (button && manual) { button.disabled = true; button.textContent = 'Memeriksa…'; }
    try {
      const response = await fetch('/api/payment-status', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId }), cache: 'no-store'
      });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.message || 'Status pembayaran belum dapat diperiksa.');
      if (result.status === 'paid') {
        if (statusTimer) clearInterval(statusTimer);
        byId('autoCheckText').textContent = 'Pembayaran berhasil. Mengalihkan…';
        byId('qrisExpiry').textContent = 'Pembayaran berhasil diverifikasi.';
        await sleep(700);
        if (result.redirectUrl && new URL(result.redirectUrl, location.origin).origin === location.origin) location.replace(result.redirectUrl);
        else location.replace(`/api/auto-redirect?slug=${encodeURIComponent(slug)}&order=${encodeURIComponent(orderId)}`);
      } else if (['expired', 'failed', 'cancelled'].includes(result.status)) {
        if (statusTimer) clearInterval(statusTimer);
        message('qrisMessage', 'Transaksi sudah tidak aktif. Silakan muat ulang halaman untuk mencoba kembali.');
      } else {
        byId('autoCheckText').textContent = 'Belum terdeteksi. Halaman akan memeriksa kembali otomatis.';
        if (manual) message('qrisMessage', 'Pembayaran belum terdeteksi. Pastikan nominal dan transaksi sudah benar.');
      }
    } catch (error) { if (manual) message('qrisMessage', error.message || 'Gagal memeriksa pembayaran.'); }
    finally { checking = false; if (button && manual) { button.disabled = false; button.textContent = '↻ Cek Pembayaran'; } }
  }

  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    hide(initial); show(processing);
    for (let n = 3; n >= 1; n--) { byId('processingCountdown').textContent = String(n); await sleep(1000); }
    try {
      const response = await fetch('/api/payment-create', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'auto', slug, amount: 3500 }), cache: 'no-store'
      });
      const result = await readJson(response);
      if (!response.ok || !result.ok) throw new Error(result.message || 'Gateway pembayaran belum tersedia.');
      if (!result.orderId || !result.qrImageUrl) throw new Error('Gateway tidak mengirim data QRIS yang valid.');
      orderId = String(result.orderId);
      const qrUrl = new URL(result.qrImageUrl, location.origin);
      if (!['https:', 'http:'].includes(qrUrl.protocol)) throw new Error('Alamat QRIS tidak valid.');
      byId('paymentQr').src = qrUrl.href;
      hide(processing); show(qris); show(byId('qrisVisual'));
      hide(byId('qrisUnavailable'));
      if (result.expiresAt) byId('qrisExpiry').textContent = `Berlaku sampai ${new Date(result.expiresAt).toLocaleString('id-ID')}`;
      byId('checkPayment').addEventListener('click', () => checkStatus(true));
      statusTimer = setInterval(() => checkStatus(false), 5000);
      checkStatus(false);
    } catch (error) {
      hide(processing); show(qris); show(byId('qrisUnavailable'));
      byId('qrisExpiry').textContent = 'Transaksi belum dibuat';
      message('qrisMessage', error.message || 'QRIS belum tersedia.');
      startButton.disabled = false;
    }
  });
}

async function initRegularCheckout(type, slug) {
  show(byId('regularCheckout'));
  const client = window.BEARN?.client;
  if (!client || !slug || !['auto', 'payment'].includes(type)) { message('paymentMessage', 'Detail pembayaran tidak valid.'); return; }
  const table = type === 'auto' ? 'auto_links' : 'payment_links';
  const columns = type === 'auto' ? 'title,slug,price,access_mode,is_published' : 'title,slug,price,description,is_active';
  const { data, error } = await client.from(table).select(columns).eq('slug', slug).maybeSingle();
  if (error || !data || (type === 'auto' && !data.is_published) || (type === 'payment' && !data.is_active)) {
    message('paymentMessage', 'Link pembayaran tidak ditemukan atau sudah tidak aktif.'); return;
  }
  const amount = type === 'auto' ? 3500 : Number(data.price);
  const fee = type === 'auto' ? 1500 : Math.round(amount * 0.10);
  const net = type === 'auto' ? 2000 : amount - fee;
  byId('checkoutType').textContent = type === 'auto' ? 'AUTO LINK DIRECT' : 'PAYMENT LINK';
  byId('checkoutTitle').textContent = data.title;
  byId('checkoutDescription').textContent = data.description || '';
  byId('checkoutAmount').textContent = money(amount);
  byId('checkoutFeeLabel').textContent = type === 'auto' ? 'Biaya BEARN' : 'Biaya platform (10%)';
  byId('checkoutFee').textContent = money(fee);
  byId('checkoutCreatorNet').textContent = money(net);
  byId('checkoutTotal').textContent = money(amount);
  message('paymentMessage', 'Gateway pembayaran belum dikonfigurasi. Status lunas hanya boleh ditetapkan setelah verifikasi server dari penyedia pembayaran.');
}

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  const type = param('type');
  const slug = param('slug');
  if (type === 'auto' && slug) await initAutoCheckout(slug);
  else await initRegularCheckout(type, slug);
});
