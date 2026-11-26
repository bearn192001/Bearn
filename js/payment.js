import { init } from '/js/core.js';
import { param, message, money } from '/js/flow-common.js';

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  const type = param('type');
  const slug = param('slug');
  const client = window.BEARN?.client;
  if (!client || !slug || !['auto', 'payment'].includes(type)) {
    message('paymentMessage', 'Detail pembayaran tidak valid.');
    return;
  }
  const table = type === 'auto' ? 'auto_links' : 'payment_links';
  const columns = type === 'auto'
    ? 'title,slug,price,access_mode,is_published'
    : 'title,slug,price,description,is_active';
  const { data, error } = await client.from(table).select(columns).eq('slug', slug).maybeSingle();
  if (error || !data || (type === 'auto' && !data.is_published) || (type === 'payment' && !data.is_active)) {
    message('paymentMessage', 'Link pembayaran tidak ditemukan atau sudah tidak aktif.');
    return;
  }

  const amount = type === 'auto' ? 3500 : Number(data.price);
  const fee = type === 'auto' ? 1500 : Math.round(amount * 0.10);
  const net = type === 'auto' ? 2000 : amount - fee;
  document.getElementById('checkoutType').textContent = type === 'auto' ? 'AUTO LINK DIRECT' : 'PAYMENT LINK';
  document.getElementById('checkoutTitle').textContent = data.title;
  document.getElementById('checkoutDescription').textContent = data.description || '';
  document.getElementById('checkoutAmount').textContent = money(amount);
  document.getElementById('checkoutFeeLabel').textContent = type === 'auto' ? 'Biaya BEARN' : 'Biaya platform (10%)';
  document.getElementById('checkoutFee').textContent = money(fee);
  document.getElementById('checkoutCreatorNet').textContent = money(net);
  document.getElementById('checkoutTotal').textContent = money(amount);

  const unavailable = document.getElementById('paymentUnavailable');
  if (unavailable) {
    unavailable.hidden = false;
    unavailable.textContent = 'Gateway pembayaran belum dikonfigurasi. Halaman ini hanya menampilkan rincian; pembayaran belum dapat dilakukan atau dikonfirmasi.';
  }
  message('paymentMessage', 'Status paid hanya boleh dicatat setelah webhook gateway memverifikasi pembayaran. Jangan menandai transaksi lunas dari browser.');
});
