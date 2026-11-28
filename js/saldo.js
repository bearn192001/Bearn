import { init, money, client, toast } from '/js/core.js';

const byId = id => document.getElementById(id);
const PAGE_SIZE = 5;
let currentPage = 0;
let totalCount = 0;
let currentStart = '';
let currentEnd = '';
let requestSequence = 0;
let activeClient = null;

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta'
});
const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
});
const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
});

function jakartaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(dateString, amount) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
}

function displayDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString))) return '-';
  const [year, month, day] = dateString.split('-').map(Number);
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function setActivePeriod(days) {
  const today = jakartaDateString();
  currentEnd = today;
  currentStart = shiftDate(today, -(days - 1));
  byId('startDate').value = currentStart;
  byId('endDate').value = currentEnd;
  document.querySelectorAll('.period-tab').forEach(button => {
    button.classList.toggle('is-active', Number(button.dataset.days) === days);
  });
  currentPage = 0;
  loadOverview();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatTransactionDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : dateTimeFormatter.format(date);
}

function categoryDetails(item) {
  const type = String(item?.reference_type || '');
  if (type === 'auto_link_view' || type === 'auto_link_order') {
    return { title: 'Pendapatan Auto Link', className: 'auto', icon: 'fa-link' };
  }
  if (type === 'payment_link_order') {
    return { title: 'Pendapatan Payment Link', className: 'payment', icon: 'fa-credit-card' };
  }
  return { title: String(item?.category || 'Pendapatan'), className: 'other', icon: 'fa-wallet' };
}

function renderItems(items) {
  const host = byId('earningList');
  if (!host) return;

  if (!Array.isArray(items) || items.length === 0) {
    host.innerHTML = '<div class="history-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i><strong>Belum ada pendapatan</strong><span>Belum ada transaksi pada periode tanggal ini.</span></div>';
    return;
  }

  host.innerHTML = items.map(item => {
    const details = categoryDetails(item);
    const note = escapeHtml(item?.note || 'Pendapatan berhasil diterima');
    const amount = money(item?.amount);
    return `<article class="earning-row">
      <span class="earning-icon ${details.className}"><i class="fa-solid ${details.icon}" aria-hidden="true"></i></span>
      <span class="earning-info"><strong>${escapeHtml(details.title)}</strong><small>${escapeHtml(formatTransactionDate(item?.created_at))} WIB</small><small class="earning-note">${note}</small></span>
      <strong class="earning-amount">+${escapeHtml(amount)}</strong>
    </article>`;
  }).join('');
}

function renderError(message) {
  const host = byId('earningList');
  if (host) {
    host.innerHTML = `<div class="history-empty wallet-error"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><strong>Data saldo belum dapat dimuat</strong><span>${escapeHtml(message)}</span></div>`;
  }
  const updated = byId('walletUpdated');
  if (updated) updated.textContent = 'Gagal memperbarui';
  updatePagination(0);
}

function updatePagination(count = totalCount) {
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const start = count ? currentPage * PAGE_SIZE + 1 : 0;
  const end = Math.min((currentPage + 1) * PAGE_SIZE, count);
  byId('historyCount').textContent = count
    ? `Menampilkan ${start}–${end} dari ${count.toLocaleString('id-ID')} pendapatan`
    : 'Menampilkan 0 pendapatan';
  byId('pageLabel').textContent = `${currentPage + 1} / ${pageCount}`;
  byId('prevPage').disabled = currentPage <= 0;
  byId('nextPage').disabled = currentPage >= pageCount - 1;
}

function friendlyError(error) {
  const message = String(error?.message || error?.details || 'Kesalahan tidak diketahui');
  const code = String(error?.code || '');
  if (code === 'PGRST202' || /function .*get_my_wallet_overview.*not found|could not find the function/i.test(message)) {
    return 'Fungsi get_my_wallet_overview tidak ditemukan pada project Supabase yang sedang dipakai. Periksa apakah SQL 16 dijalankan pada project yang sama dengan konfigurasi aplikasi.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    return 'Akses baca tabel wallet ditolak. Periksa GRANT SELECT dan kebijakan RLS pada SQL 16.';
  }
  if (code === '28000' || /jwt|auth.*missing|not authenticated|session.*missing/i.test(message)) {
    return 'Sesi login tidak valid atau sudah berakhir. Silakan login kembali.';
  }
  if (/tanggal akhir|rentang tanggal/i.test(message)) return message;
  return `Supabase: ${message}`;
}

async function loadOverview() {
  const requestId = ++requestSequence;
  const host = byId('earningList');
  if (host) host.innerHTML = '<div class="history-empty">Memuat riwayat pendapatan…</div>';

  const db = activeClient || window.BEARN?.client || client;
  if (!db) {
    renderError('Koneksi Supabase belum terbentuk. Periksa konfigurasi dan pemuatan library Supabase.');
    return;
  }

  try {
    const { data, error } = await db.rpc('get_my_wallet_overview', {
      p_start_date: currentStart,
      p_end_date: currentEnd,
      p_limit: PAGE_SIZE,
      p_offset: currentPage * PAGE_SIZE
    });

    if (requestId !== requestSequence) return;
    if (error) {
      console.error('[BEARN saldo] RPC get_my_wallet_overview gagal:', error);
      renderError(friendlyError(error));
      toast('Gagal memuat data saldo. Lihat keterangan pada halaman saldo.');
      return;
    }

    const result = Array.isArray(data) ? (data[0] || {}) : (data || {});
    byId('availableBalance').textContent = money(result.available_balance);
    byId('autoLinkBalance').textContent = money(result.auto_link_balance);
    byId('paymentLinkBalance').textContent = money(result.payment_link_balance);
    byId('monthEarnings').textContent = money(result.month_earnings);
    byId('rangeEarnings').textContent = money(result.range_earnings);

    totalCount = Math.max(0, Number(result.total_count || 0));
    renderItems(result.items || []);
    updatePagination(totalCount);

    byId('walletUpdated').textContent = `Diperbarui ${timeFormatter.format(new Date())} WIB`;
    byId('rangeLabel').textContent = `Pendapatan ${displayDate(currentStart)} – ${displayDate(currentEnd)}`;
  } catch (error) {
    if (requestId !== requestSequence) return;
    console.error('[BEARN saldo] Kesalahan tidak terduga:', error);
    renderError(friendlyError(error));
    toast('Terjadi kesalahan saat memuat saldo.');
  }
}

function applyCustomDates() {
  const start = byId('startDate').value;
  const end = byId('endDate').value;
  if (!start || !end) return toast('Pilih tanggal mulai dan tanggal akhir.');
  if (end < start) return toast('Tanggal akhir tidak boleh lebih awal dari tanggal mulai.');

  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  if ((endUtc - startUtc) / 86400000 > 366) return toast('Rentang tanggal maksimal 367 hari.');

  currentStart = start;
  currentEnd = end;
  currentPage = 0;
  document.querySelectorAll('.period-tab').forEach(button => button.classList.remove('is-active'));
  loadOverview();
}

function bindPageEvents() {
  document.querySelectorAll('.period-tab').forEach(button => {
    button.addEventListener('click', () => {
      const days = Number(button.dataset.days);
      if ([1, 7, 15, 30].includes(days)) setActivePeriod(days);
    });
  });

  byId('applyDate')?.addEventListener('click', applyCustomDates);
  byId('prevPage')?.addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage -= 1;
      loadOverview();
    }
  });
  byId('nextPage')?.addEventListener('click', () => {
    if ((currentPage + 1) * PAGE_SIZE < totalCount) {
      currentPage += 1;
      loadOverview();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindPageEvents();
  try {
    await init();
    activeClient = window.BEARN?.client || client;
    if (!activeClient) {
      renderError('Supabase belum terhubung. Periksa URL dan anon key pada /js/config.js serta library Supabase.');
      return;
    }
    setActivePeriod(7);
  } catch (error) {
    console.error('[BEARN saldo] Inisialisasi halaman gagal:', error);
    renderError('Halaman gagal diinisialisasi. Periksa koneksi komponen navbar dan konfigurasi Supabase.');
  }
});
