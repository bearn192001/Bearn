import { init, client, user, money, toast } from '/js/core.js';

const $ = id => document.getElementById(id);
const fmt = value => money(Math.max(0, Number(value || 0)));
const number = value => Math.max(0, Math.floor(Number(value || 0)));
const state = { user: null, balance: 0, config: {}, methods: [], selectedMethod: null, instantUsed: 0, manualUsed: 0, holidays: [] };

function setText(id, value) { const node = $(id); if (node) node.textContent = value; }
function setDisabled(id, disabled) { const node = $(id); if (node) node.disabled = !!disabled; }
function dateLabel(value) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00+07:00`));
}
function statusMeta(status) {
  const map = {
    pending: ['Menunggu', 'status-pending'], processing: ['Sedang diproses', 'status-processing'],
    approved: ['Disetujui', 'status-processing'], paid: ['Sudah dibayar', 'status-paid'],
    returned: ['Dikembalikan', 'status-returned'], rejected: ['Ditolak', 'status-rejected']
  };
  return map[status] || [status || '—', 'status-pending'];
}
function holidayIcon(name = '') {
  const n = name.toLowerCase();
  if (/natal|yesus|wafat|kebangkitan|paskah|kenaikan/.test(n)) return '✝️';
  if (/idul|isra|maulid|muharam|ramadan/.test(n)) return '🕌';
  if (/nyepi/.test(n)) return '🕉️';
  if (/waisak/.test(n)) return '🪷';
  if (/imlek/.test(n)) return '🧧';
  if (/buruh/.test(n)) return '🛠️';
  if (/pancasila|kemerdekaan|proklamasi/.test(n)) return '🇮🇩';
  return '🎌';
}
function renderSchedule() {
  const open = state.config.is_open === true;
  const reason = state.config.closed_reason || 'Layanan withdraw sedang tutup.';
  const schedule = $('withdrawSchedule');
  if (schedule) schedule.classList.toggle('is-closed', !open);
  $('scheduleIcon').textContent = open ? '✓' : (state.config.closed_kind === 'weekend' ? '🏖️' : state.config.closed_kind === 'holiday' ? holidayIcon(reason) : '🌄');
  setText('scheduleTitle', open ? 'Layanan withdraw sedang buka' : 'Withdraw sedang tutup');
  setText('scheduleMessage', open ? 'Kamu dapat mengajukan withdraw sekarang. Layanan beroperasi Senin–Jumat, pukul 09.00–21.00 WIB.' : reason);
  const badge = $('withdrawScheduleBadge');
  if (badge) {
    badge.classList.toggle('schedule-badge-closed', !open);
    badge.innerHTML = open ? '<span class="live-dot"></span><span>Layanan buka</span>' : '<span aria-hidden="true">🏖️</span><span>Layanan tutup</span>';
  }
  updateSubmitStates();
}
function renderMetrics() {
  const limit = number(state.config.instant_daily_limit || 500000);
  const used = number(state.instantUsed);
  const remaining = Math.max(0, limit - used);
  const count = number(state.manualUsed);
  setText('availableBalance', fmt(state.balance));
  setText('instantDailyUsage', `${fmt(used)} / ${fmt(limit)}`);
  setText('instantRemaining', `Sisa limit ${fmt(remaining)} hari ini`);
  setText('manualDailyUsage', `${count} / 5`);
  setText('manualCountHint', `${count} dari 5 pengajuan hari ini`);
  const bar = $('instantProgress');
  if (bar) bar.style.width = `${limit ? Math.min(100, used / limit * 100) : 0}%`;
  updateBreakdowns();
}
function renderMethods() {
  const card = $('payoutCard');
  const empty = $('payoutEmpty');
  const selectWrap = $('payoutSelectWrap');
  const select = $('payoutMethodSelect');
  const has = state.methods.length > 0;
  card.hidden = !has; empty.hidden = has; selectWrap.hidden = state.methods.length < 2;
  if (!has) { state.selectedMethod = null; updateSubmitStates(); return; }
  const preferred = state.methods.find(item => item.is_default) || state.methods[0];
  state.selectedMethod = state.methods.find(item => item.id === select?.value) || preferred;
  setText('payoutTypeLabel', state.selectedMethod.method_type === 'ewallet' ? 'E-WALLET' : 'BANK');
  setText('payoutProvider', state.selectedMethod.provider);
  setText('payoutAccountName', state.selectedMethod.account_name);
  setText('payoutAccountNumber', state.selectedMethod.account_number);
  if (select) {
    select.innerHTML = '';
    state.methods.forEach(method => {
      const option = document.createElement('option');
      option.value = method.id;
      option.textContent = `${method.provider} · ${method.account_name} · ${method.account_number}`;
      option.selected = method.id === state.selectedMethod.id;
      select.append(option);
    });
  }
  updateSubmitStates();
}
function updateBreakdowns() {
  const instant = number($('instantAmount')?.value);
  const manual = number($('manualAmount')?.value);
  const instantFee = number(state.config.instant_fee || 13000);
  const manualFee = number(state.config.manual_fee || 10000);
  const tax = number(state.config.tax_amount || 0);
  setText('instantGross', fmt(instant)); setText('instantFee', `− ${fmt(instant ? instantFee : 0)}`);
  setText('instantTax', `− ${fmt(instant ? tax : 0)}`); setText('instantNet', fmt(Math.max(0, instant - (instant ? instantFee + tax : 0))));
  setText('manualGross', fmt(manual)); setText('manualFee', `− ${fmt(manual ? manualFee : 0)}`);
  setText('manualTax', `− ${fmt(manual ? tax : 0)}`); setText('manualNet', fmt(Math.max(0, manual - (manual ? manualFee + tax : 0))));
  updateSubmitStates();
}
function updateSubmitStates() {
  const open = state.config.is_open === true;
  const hasMethod = !!state.selectedMethod;
  const instant = number($('instantAmount')?.value);
  const manual = number($('manualAmount')?.value);
  const instantLimit = Math.max(0, number(state.config.instant_daily_limit || 500000) - number(state.instantUsed));
  const manualCount = number(state.manualUsed);
  const validInstant = instant >= 50000 && instant <= 500000 && instant <= instantLimit && instant <= state.balance && instant > number(state.config.instant_fee || 13000) + number(state.config.tax_amount || 0);
  const validManual = manual >= 100000 && manual <= state.balance && manual > number(state.config.manual_fee || 10000) + number(state.config.tax_amount || 0) && manualCount < 5;
  setDisabled('instantSubmit', !(open && hasMethod && validInstant && $('instantTerms')?.checked));
  setDisabled('manualSubmit', !(open && hasMethod && validManual && $('manualTerms')?.checked));
  if (!open) {
    $('instantSubmit').innerHTML = '<span aria-hidden="true">🏖️</span> Withdraw sedang tutup';
    $('manualSubmit').innerHTML = '<span aria-hidden="true">🏖️</span> Withdraw sedang tutup';
  } else {
    $('instantSubmit').innerHTML = '<i class="fa-solid fa-bolt" aria-hidden="true"></i> Ajukan Withdraw Instan';
    $('manualSubmit').innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Ajukan Withdraw Manual';
  }
}
function renderHistory(rows) {
  const host = $('withdrawHistory');
  if (!host) return;
  if (!rows?.length) { host.innerHTML = '<div class="empty">Belum ada riwayat pengajuan withdraw.</div>'; return; }
  host.innerHTML = '';
  rows.forEach(row => {
    const [statusLabel, statusClass] = statusMeta(row.status);
    const instant = row.withdraw_type === 'instant';
    const item = document.createElement('article'); item.className = 'history-item';
    const top = document.createElement('div'); top.className = 'history-top';
    const title = document.createElement('div'); title.className = 'history-title';
    const kind = document.createElement('span'); kind.className = `method-tag ${instant ? 'method-instant' : 'method-manual'}`; kind.textContent = instant ? 'INSTAN' : 'MANUAL';
    const id = document.createElement('small'); id.textContent = `ID ${String(row.id).slice(0, 8).toUpperCase()}`;
    title.append(kind, id);
    const status = document.createElement('span'); status.className = `status-tag ${statusClass}`; status.textContent = statusLabel;
    top.append(title, status);
    const amount = document.createElement('div'); amount.className = 'history-amount'; amount.textContent = fmt(row.amount);
    const detail = document.createElement('div'); detail.className = 'history-details';
    const date = document.createElement('span'); date.textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(row.created_at));
    const destination = document.createElement('span'); destination.textContent = `${row.destination_provider || row.destination_name || 'Rekening'} · ${row.destination_account || '—'} · ${row.destination_name || '—'}`;
    const net = document.createElement('span'); net.textContent = `Bersih ${fmt(row.net_amount ?? (row.amount - row.provider_fee - row.tax_amount))}`;
    detail.append(date, destination, net); item.append(top, amount, detail);
    if (row.admin_note) { const note = document.createElement('p'); note.className = 'history-note'; note.textContent = `Catatan admin: ${row.admin_note}`; item.append(note); }
    host.append(item);
  });
}
function renderHolidays(rows) {
  const section = $('holidaySection'); const host = $('holidayList');
  if (!rows?.length) { section.hidden = true; return; }
  section.hidden = false; host.innerHTML = '';
  rows.slice(0, 8).forEach(row => {
    const item = document.createElement('div'); item.className = 'holiday-item';
    const icon = document.createElement('span'); icon.className = 'holiday-icon'; icon.textContent = holidayIcon(row.name);
    const copy = document.createElement('span'); copy.className = 'holiday-copy';
    const name = document.createElement('b'); name.textContent = row.name;
    const date = document.createElement('small'); date.textContent = `${dateLabel(row.holiday_date)} · ${row.holiday_type === 'collective' ? 'Cuti bersama' : 'Libur nasional'}`;
    copy.append(name, date); item.append(icon, copy); host.append(item);
  });
}
async function loadData() {
  const currentUser = await user();
  if (!client || !currentUser) throw new Error('Sesi login tidak tersedia. Silakan masuk kembali.');
  state.user = currentUser;
  const [configResult, walletResult, methodsResult, historyResult, usageResult, holidayResult] = await Promise.all([
    client.rpc('get_withdrawal_config'),
    client.from('wallet_accounts').select('earning_balance').eq('user_id', currentUser.id).maybeSingle(),
    client.from('payout_methods').select('id,method_type,provider,account_name,account_number,is_default').eq('user_id', currentUser.id).eq('is_active', true).order('is_default', { ascending: false }).order('created_at', { ascending: false }),
    client.from('withdraw_requests').select('id,withdraw_type,amount,provider_fee,tax_amount,net_amount,destination_provider,destination_type,destination_name,destination_account,status,admin_note,created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20),
    client.rpc('get_my_withdraw_usage'),
    client.from('withdrawal_holidays').select('holiday_date,name,holiday_type').gte('holiday_date', new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })).order('holiday_date', { ascending: true }).limit(30)
  ]);
  if (configResult.error) throw configResult.error;
  if (walletResult.error) throw walletResult.error;
  if (methodsResult.error) throw methodsResult.error;
  if (historyResult.error) throw historyResult.error;
  if (usageResult.error) throw usageResult.error;
  if (holidayResult.error) throw holidayResult.error;
  state.config = configResult.data || {};
  state.balance = number(walletResult.data?.earning_balance);
  state.methods = methodsResult.data || [];
  state.instantUsed = number(usageResult.data?.instant_amount);
  state.manualUsed = number(usageResult.data?.manual_count);
  state.holidays = holidayResult.data || [];
  renderSchedule(); renderMetrics(); renderMethods(); renderHistory(historyResult.data || []); renderHolidays(state.holidays);
}
async function submitWithdraw(method, form) {
  const amount = number(new FormData(form).get('amount'));
  const accepted = $(method === 'instant' ? 'instantTerms' : 'manualTerms').checked;
  if (!accepted) { toast('Harap setujui ketentuan withdraw terlebih dahulu.'); return; }
  if (!state.selectedMethod) { toast('Tambahkan rekening bank atau e-wallet terlebih dahulu.'); return; }
  const fee = number(method === 'instant' ? state.config.instant_fee : state.config.manual_fee);
  const tax = number(state.config.tax_amount);
  const net = amount - fee - tax;
  const methodLabel = method === 'instant' ? 'Withdraw Instan' : 'Withdraw Manual';
  const destination = `${state.selectedMethod.provider} · ${state.selectedMethod.account_name} · ${state.selectedMethod.account_number}`;
  const confirmText = `${methodLabel}\nNominal: ${fmt(amount)}\nFee: ${fmt(fee)}\nPajak: ${fmt(tax)}\nDana bersih: ${fmt(net)}\nTujuan: ${destination}\n\nLanjutkan pengajuan?`;
  if (!window.confirm(confirmText)) return;
  const submitId = method === 'instant' ? 'instantSubmit' : 'manualSubmit';
  setDisabled(submitId, true);
  try {
    const { data, error } = await client.rpc('submit_withdraw_request', {
      p_withdraw_type: method,
      p_amount: amount,
      p_payout_method_id: state.selectedMethod.id,
      p_terms_accepted: true
    });
    if (error) throw error;
    toast(`${methodLabel} berhasil diajukan. ID: ${String(data?.id || '').slice(0, 8).toUpperCase()}`);
    form.reset();
    await loadData();
  } catch (error) {
    console.error('[BEARN withdraw submit]', error);
    toast(error.message || 'Pengajuan withdraw gagal. Silakan coba kembali.');
    updateSubmitStates();
  }
}

// UI event bindings
$('payoutMethodSelect')?.addEventListener('change', event => {
  state.selectedMethod = state.methods.find(method => method.id === event.target.value) || null;
  renderMethods();
});
$('instantAmount')?.addEventListener('input', updateBreakdowns);
$('manualAmount')?.addEventListener('input', updateBreakdowns);
$('instantTerms')?.addEventListener('change', updateSubmitStates);
$('manualTerms')?.addEventListener('change', updateSubmitStates);
document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click', () => {
  $('instantAmount').value = button.dataset.amount;
  document.querySelectorAll('[data-amount]').forEach(item => item.classList.toggle('is-selected', item === button));
  updateBreakdowns();
}));
$('useAllBalance')?.addEventListener('click', () => { $('manualAmount').value = state.balance; updateBreakdowns(); });
$('instantWithdrawForm')?.addEventListener('submit', event => { event.preventDefault(); submitWithdraw('instant', event.currentTarget); });
$('manualWithdrawForm')?.addEventListener('submit', event => { event.preventDefault(); submitWithdraw('manual', event.currentTarget); });

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  try { await loadData(); }
  catch (error) {
    console.error('[BEARN withdraw load]', error);
    toast(error.message || 'Gagal memuat data withdraw.');
    $('withdrawHistory').innerHTML = '<div class="empty">Data withdraw belum dapat dimuat. Periksa migrasi SQL withdraw dan koneksi akun.</div>';
  }
});
