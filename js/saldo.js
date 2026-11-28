import { init, money, client, toast } from '/js/core.js';

const byId = id => document.getElementById(id);
const PAGE_SIZE = 5;
let currentPage = 0;
let totalCount = 0;
let activeDays = 7;
let currentStart = '';
let currentEnd = '';

const pad = value => String(value).padStart(2, '0');
function localDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function dateOffset(daysAgo) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}
function setPeriod(days) {
  activeDays = days;
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  currentStart = localDateString(start);
  currentEnd = localDateString(end);
  byId('startDate').value = currentStart;
  byId('endDate').value = currentEnd;
  document.querySelectorAll('.period-tab').forEach(button => {
    button.classList.toggle('is-active', Number(button.dataset.days) === days);
  });
  currentPage = 0;
  loadOverview();
}
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
function categoryClass(category) {
  return category === 'Payment Link' ? 'payment' : category === 'Auto Link' ? 'auto' : 'other';
}
function renderItems(items) {
  const host = byId('earningList');
  if (!host) return;
  if (!Array.isArray(items) || !items.length) {
    host.innerHTML = '<div class="history-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i><strong>Belum ada pendapatan</strong><span>Belum ada transaksi pada periode tanggal ini.</span></div>';
    return;
  }
  host.innerHTML = items.map(item => {
    const category = String(item.category || 'Pendapatan');
    const title = category === 'Auto Link' ? 'Pendapatan Auto Link' : category === 'Payment Link' ? 'Pendapatan Payment Link' : category;
    const note = item.note || 'Pendapatan berhasil diterima';
    const icon = category === 'Payment Link' ? 'fa-credit-card' : 'fa-link';
    return `<article class="earning-row">
      <span class="earning-icon ${categoryClass(category)}"><i class="fa-solid ${icon}" aria-hidden="true"></i></span>
      <span class="earning-info"><strong>${title}</strong><small>${formatDate(item.created_at)}</small><small class="earning-note">${escapeHtml(note)}</small></span>
      <strong class="earning-amount">+${money(item.amount)}</strong>
    </article>`;
  }).join('');
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function updatePagination() {
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  byId('historyCount').textContent = totalCount
    ? `Menampilkan ${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} dari ${totalCount.toLocaleString('id-ID')} pendapatan`
    : 'Menampilkan 0 pendapatan';
  byId('pageLabel').textContent = `${currentPage + 1} / ${pageCount}`;
  byId('prevPage').disabled = currentPage <= 0;
  byId('nextPage').disabled = currentPage >= pageCount - 1;
}
async function loadOverview() {
  if (!client) {
    byId('earningList').innerHTML = '<div class="history-empty">Database belum terhubung.</div>';
    return;
  }
  byId('earningList').innerHTML = '<div class="history-empty">Memuat riwayat pendapatan…</div>';
  const { data, error } = await client.rpc('get_my_wallet_overview', {
    p_start_date: currentStart,
    p_end_date: currentEnd,
    p_limit: PAGE_SIZE,
    p_offset: currentPage * PAGE_SIZE
  });
  if (error) {
    console.error('[BEARN wallet]', error.message);
    byId('earningList').innerHTML = '<div class="history-empty">Gagal memuat saldo. Pastikan migrasi SQL 16 sudah dijalankan.</div>';
    toast('Gagal memuat data saldo.');
    return;
  }
  const result = data || {};
  byId('availableBalance').textContent = money(result.available_balance);
  byId('autoLinkBalance').textContent = money(result.auto_link_balance);
  byId('paymentLinkBalance').textContent = money(result.payment_link_balance);
  byId('monthEarnings').textContent = money(result.month_earnings);
  byId('rangeEarnings').textContent = money(result.range_earnings);
  totalCount = Number(result.total_count || 0);
  renderItems(result.items || []);
  updatePagination();
  byId('walletUpdated').textContent = `Diperbarui ${new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
  byId('rangeLabel').textContent = `Pendapatan ${formatDate(currentStart + 'T00:00:00').split(',')[0]} – ${formatDate(currentEnd + 'T00:00:00').split(',')[0]}`;
}
function applyCustomDates() {
  const start = byId('startDate').value;
  const end = byId('endDate').value;
  if (!start || !end) return toast('Pilih tanggal mulai dan tanggal akhir.');
  if (end < start) return toast('Tanggal akhir tidak boleh lebih awal dari tanggal mulai.');
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  if ((endMs - startMs) / 86400000 > 366) return toast('Rentang tanggal maksimal 367 hari.');
  currentStart = start;
  currentEnd = end;
  activeDays = 0;
  currentPage = 0;
  document.querySelectorAll('.period-tab').forEach(button => button.classList.remove('is-active'));
  loadOverview();
}
document.addEventListener('DOMContentLoaded', async () => {
  await init();
  document.querySelectorAll('.period-tab').forEach(button => {
    button.addEventListener('click', () => setPeriod(Number(button.dataset.days)));
  });
  byId('applyDate')?.addEventListener('click', applyCustomDates);
  byId('prevPage')?.addEventListener('click', () => {
    if (currentPage > 0) { currentPage--; loadOverview(); }
  });
  byId('nextPage')?.addEventListener('click', () => {
    if ((currentPage + 1) * PAGE_SIZE < totalCount) { currentPage++; loadOverview(); }
  });
  setPeriod(7);
});
