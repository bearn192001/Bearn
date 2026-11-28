import { init } from '/js/core.js';
import { param, message, money } from '/js/flow-common.js';

const $ = (id) => document.getElementById(id);
const AUTO_AMOUNT = 3500;
let activePaymentId = '';
let statusTimer = null;
let statusBusy = false;
let redirecting = false;

async function readJson(response) {
  const text = await response.text();
  if (!text) throw new Error(`Server mengirim respons kosong (HTTP ${response.status}).`);
  try { return JSON.parse(text); }
  catch { throw new Error(`Respons server tidak valid (HTTP ${response.status}).`); }
}

function showAutoPanel(panel) {
  ['prePayment', 'processingPanel', 'qrisPanel', 'paidPanel'].forEach(id => { $(id).hidden = id !== panel; });
}
function showAutoError(error) {
  $('autoPaymentError').textContent = error?.message || 'Pembayaran tidak dapat diproses. Silakan coba kembali.';
  $('autoPaymentError').hidden = false;
  if (statusTimer) clearInterval(statusTimer);
  $('startAutoPayment').disabled = false;
  $('startAutoPayment').textContent = 'Coba Buat QRIS Lagi';
  showAutoPanel('prePayment');
}
function stopStatusPolling() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = null;
}

async function createAutoPayment(slug) {
  const response = await fetch('/api/auto-link-payment-create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }), cache: 'no-store'
  });
  const result = await readJson(response);
  if (!response.ok || !result.ok) throw new Error(result.message || 'Gagal membuat QRIS.');
  if (!result.paymentId || !result.qrUrl) throw new Error('Cashi belum mengirim gambar QRIS. Silakan coba lagi.');
  return result;
}

async function checkAutoPayment(manual = false) {
  if (!activePaymentId || statusBusy || redirecting) return;
  statusBusy = true;
  const button = $('checkPayment');
  if (manual) { button.disabled = true; button.textContent = 'Memeriksa pembayaran…'; }
  try {
    const response = await fetch('/api/auto-link-payment-status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentId: activePaymentId }), cache: 'no-store'
    });
    const result = await readJson(response);
    if (!response.ok || !result.ok) throw new Error(result.message || 'Belum dapat memeriksa status pembayaran.');
    if (result.status === 'paid') {
      redirecting = true; stopStatusPolling(); showAutoPanel('paidPanel');
      $('paymentMessage').textContent = 'Pembayaran terverifikasi. Mengalihkan…';
      setTimeout(() => { location.replace(`/with-auto-link.html?paid=${encodeURIComponent(activePaymentId)}&slug=${encodeURIComponent(param('slug') || '')}`); }, 1400);
    } else if (result.status === 'expired' || result.status === 'failed') {
      stopStatusPolling(); throw new Error('QRIS sudah kedaluwarsa atau transaksi gagal. Silakan buat QRIS baru.');
    } else {
      $('autoCheckText').textContent = manual ? 'Pembayaran belum terdeteksi. Kami akan memeriksa kembali otomatis.' : 'Belum terdeteksi. Pengecekan otomatis tetap berjalan…';
      if (manual) $('paymentMessage').textContent = 'Pembayaran belum terdeteksi. Pastikan nominal sudah dibayar dan tunggu beberapa saat.';
    }
  } catch (error) {
    $('paymentMessage').textContent = error.message || 'Pengecekan gagal. Sistem akan mencoba kembali.';
  } finally {
    statusBusy = false;
    if (manual && button) { button.disabled = false; button.textContent = '↻  Cek Pembayaran'; }
  }
}

async function initAutoCheckout(slug) {
  $('autoCheckout').hidden = false;
  $('legacyCheckout').hidden = true;
  $('startAutoPayment').addEventListener('click', async () => {
    if ($('startAutoPayment').disabled) return;
    $('startAutoPayment').disabled = true;
    showAutoPanel('processingPanel');
    let remaining = 3;
    $('processingCount').textContent = remaining;
    const countdown = setInterval(() => {
      remaining -= 1;
      $('processingCount').textContent = Math.max(remaining, 0);
      if (remaining <= 0) clearInterval(countdown);
    }, 1000);
    try {
      const [payment] = await Promise.all([
        createAutoPayment(slug),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
      activePaymentId = payment.paymentId;
      $('qrisAmount').textContent = money(AUTO_AMOUNT);
      $('paymentOrderId').textContent = payment.orderId || payment.paymentId;
      $('paymentQr').src = payment.qrUrl;
      $('paymentQr').hidden = false;
      $('qrFallback').hidden = true;
      $('paymentQr').onerror = () => { $('paymentQr').hidden = true; $('qrFallback').hidden = false; };
      showAutoPanel('qrisPanel');
      $('autoCheckText').textContent = 'Memeriksa pembayaran secara berkala…';
      statusTimer = setInterval(() => checkAutoPayment(false), 5000);
      checkAutoPayment(false);
    } catch (error) {
      clearInterval(countdown);
      showAutoError(error);
    }
  });
  $('checkPayment').addEventListener('click', () => checkAutoPayment(true));
}

async function initLegacyPayment(type, slug, client) {
  $('autoCheckout').hidden = true;
  $('legacyCheckout').hidden = false;
  if (!client || !slug || !['auto', 'payment'].includes(type)) {
    message('legacyPaymentMessage', 'Detail pembayaran tidak valid.'); return;
  }
  const table = type === 'auto' ? 'auto_links' : 'payment_links';
  const columns = type === 'auto' ? 'title,slug,price,access_mode,is_published' : 'title,slug,price,description,is_active';
  const { data, error } = await client.from(table).select(columns).eq('slug', slug).maybeSingle();
  if (error || !data || (type === 'auto' && !data.is_published) || (type === 'payment' && !data.is_active)) {
    message('legacyPaymentMessage', 'Link pembayaran tidak ditemukan atau sudah tidak aktif.'); return;
  }
  const amount = type === 'auto' ? AUTO_AMOUNT : Number(data.price);
  const fee = type === 'auto' ? 1500 : Math.round(amount * 0.10);
  const net = type === 'auto' ? 2000 : amount - fee;
  $('checkoutType').textContent = type === 'auto' ? 'AUTO LINK DIRECT' : 'PAYMENT LINK';
  $('checkoutTitle').textContent = data.title;
  $('checkoutDescription').textContent = data.description || '';
  $('checkoutAmount').textContent = money(amount);
  $('checkoutFeeLabel').textContent = type === 'auto' ? 'Biaya BEARN' : 'Biaya platform (10%)';
  $('checkoutFee').textContent = money(fee);
  $('checkoutCreatorNet').textContent = money(net);
  $('checkoutTotal').textContent = money(amount);
  $('paymentUnavailable').textContent = 'Pembayaran otomatis untuk jenis link ini belum diaktifkan.';
  message('legacyPaymentMessage', 'Status lunas hanya boleh dicatat setelah diverifikasi oleh server pembayaran.');
}

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  const type = param('type');
  const slug = param('slug');
  const client = window.BEARN?.client;
  if (type === 'auto' && slug) await initAutoCheckout(slug);
  else await initLegacyPayment(type, slug, client);
});
