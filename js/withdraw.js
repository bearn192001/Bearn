import { init, client, user, money, toast } from '/js/core.js';

const $ = id => document.getElementById(id);
const fmt = value => money(Math.max(0, Number(value || 0)));
const number = value => Math.max(0, Math.floor(Number(value || 0)));
const state = {
  user: null, balance: 0, config: {}, methods: [], selectedMethod: null,
  instantUsed: 0, manualUsed: 0, history: [], submitting: false
};

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}
function setDisabled(id, disabled) {
  const node = $(id);
  if (node) node.disabled = !!disabled;
}
function statusMeta(status) {
  const map = {
    pending: ['Menunggu', 'status-pending'],
    processing: ['Sedang diproses', 'status-processing'],
    approved: ['Disetujui', 'status-processing'],
    paid: ['Sudah dibayar', 'status-paid'],
    returned: ['Dikembalikan', 'status-returned'],
    rejected: ['Ditolak', 'status-rejected']
  };
  return map[status] || [status || '—', 'status-pending'];
}

function renderPayoutMethod() {
  const card = $('payoutCard');
  const empty = $('payoutEmpty');
  const methods = state.methods;
  if (!methods.length) {
    state.selectedMethod = null;
    if (card) card.hidden = true;
    if (empty) empty.hidden = false;
    updateSubmitStates();
    return;
  }

  state.selectedMethod = methods.find(item => item.is_default) || methods[0];
  const method = state.selectedMethod;
  const isWallet = method.method_type === 'ewallet';
  if (card) card.hidden = false;
  if (empty) empty.hidden = true;
  setText('payoutTypeLabel', isWallet ? 'E-WALLET' : 'BANK');
  setText('payoutProvider', method.provider || (isWallet ? 'E-Wallet' : 'Bank'));
  setText('payoutAccountName', `Atas nama ${method.account_name || '—'}`);
  setText('payoutAccountNumber', method.account_number || '—');
  const icon = $('payoutCardIcon');
  if (icon) icon.innerHTML = isWallet
    ? '<i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i>'
    : '<i class="fa-solid fa-building-columns" aria-hidden="true"></i>';
  updateSubmitStates();
}

function renderInstantLimit() {
  const limit = number(state.config.instant_daily_limit || 500000);
  const used = number(state.instantUsed);
  const remaining = Math.max(0, limit - used);
  const percent = limit ? Math.min(100, used / limit * 100) : 0;
  setText('instantDailyUsage', `${fmt(used)} / ${fmt(limit)}`);
  setText('instantRemaining', `Sisa limit ${fmt(remaining)} hari ini`);
  const bar = $('instantProgress');
  if (bar) bar.style.width = `${percent}%`;
  const progress = bar?.parentElement;
  if (progress) progress.setAttribute('aria-valuenow', String(Math.min(limit, used)));
  setText('instantBalanceHint', `Saldo tersedia: ${fmt(state.balance)}`);
  setText('manualBalanceHint', `Saldo tersedia: ${fmt(state.balance)}`);
  setText('manualCountHint', `${number(state.manualUsed)} dari 5 pengajuan hari ini`);
}

function updateSubmitStates() {
  const open = state.config.is_open === true;
  const hasMethod = !!state.selectedMethod;
  const instantAmount = number($('instantAmount')?.value);
  const manualAmount = number($('manualAmount')?.value);
  const instantReady = open && hasMethod && instantAmount > 0 && $('instantTerms')?.checked && !state.submitting;
  const manualReady = open && hasMethod && manualAmount > 0 && $('manualTerms')?.checked && !state.submitting;
  setDisabled('instantSubmit', !instantReady);
  setDisabled('manualSubmit', !manualReady);

  const instantButton = $('instantSubmit');
  const manualButton = $('manualSubmit');
  if (!open) {
    if (instantButton) instantButton.innerHTML = '<span aria-hidden="true">🏖️</span> Withdraw sedang tutup';
    if (manualButton) manualButton.innerHTML = '<span aria-hidden="true">🏖️</span> Withdraw sedang tutup';
  } else if (instantButton && manualButton) {
    instantButton.innerHTML = '<i class="fa-solid fa-bolt" aria-hidden="true"></i> Ajukan Withdraw Instan';
    manualButton.innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Ajukan Withdraw Manual';
  }
}

function renderHistory(rows) {
  const host = $('withdrawHistory');
  if (!host) return;
  host.replaceChildren();
  if (!rows?.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Belum ada riwayat pengajuan withdraw.';
    host.append(empty);
    return;
  }

  rows.forEach(row => {
    const [statusLabel, statusClass] = statusMeta(row.status);
    const instant = row.withdraw_type === 'instant';
    const item = document.createElement('article');
    item.className = 'history-item';

    const top = document.createElement('div');
    top.className = 'history-top';
    const title = document.createElement('div');
    title.className = 'history-title';
    const kind = document.createElement('span');
    kind.className = `method-tag ${instant ? 'method-instant' : 'method-manual'}`;
    kind.textContent = instant ? 'INSTAN' : 'MANUAL';
    const id = document.createElement('small');
    id.textContent = `ID ${String(row.id || '').slice(0, 8).toUpperCase()}`;
    title.append(kind, id);
    const status = document.createElement('span');
    status.className = `status-tag ${statusClass}`;
    status.textContent = statusLabel;
    top.append(title, status);

    const amount = document.createElement('div');
    amount.className = 'history-amount';
    amount.textContent = fmt(row.amount);
    const detail = document.createElement('div');
    detail.className = 'history-details';
    const date = document.createElement('span');
    date.textContent = row.created_at
      ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(row.created_at))
      : 'Tanggal tidak tersedia';
    const destination = document.createElement('span');
    destination.textContent = `${row.destination_type === 'ewallet' ? 'E-Wallet' : 'Bank'} ${row.destination_provider || ''} · ${row.destination_name || '—'} · ${row.destination_account || '—'}`;
    const net = document.createElement('span');
    const netAmount = row.net_amount ?? (number(row.amount) - number(row.provider_fee) - number(row.tax_amount));
    net.textContent = `Bersih ${fmt(netAmount)}`;
    detail.append(date, destination, net);
    item.append(top, amount, detail);

    if (row.admin_note) {
      const note = document.createElement('p');
      note.className = 'history-note';
      note.textContent = `Catatan admin: ${row.admin_note}`;
      item.append(note);
    }
    host.append(item);
  });
}

async function loadData() {
  const currentUser = await user();
  if (!client || !currentUser) throw new Error('Sesi login tidak tersedia. Silakan masuk kembali.');
  state.user = currentUser;

  const [configResult, walletResult, methodsResult, historyResult, usageResult] = await Promise.all([
    client.rpc('get_withdrawal_config'),
    client.from('wallet_accounts').select('earning_balance').eq('user_id', currentUser.id).maybeSingle(),
    client.from('payout_methods').select('id,method_type,provider,account_name,account_number,is_default').eq('user_id', currentUser.id).eq('is_active', true).order('is_default', { ascending: false }).order('created_at', { ascending: false }),
    client.from('withdraw_requests').select('id,withdraw_type,amount,provider_fee,tax_amount,net_amount,destination_provider,destination_type,destination_name,destination_account,status,admin_note,created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20),
    client.rpc('get_my_withdraw_usage')
  ]);

  for (const result of [configResult, walletResult, methodsResult, historyResult, usageResult]) {
    if (result.error) throw result.error;
  }

  state.config = configResult.data || {};
  state.balance = number(walletResult.data?.earning_balance);
  state.methods = methodsResult.data || [];
  state.instantUsed = number(usageResult.data?.instant_amount);
  state.manualUsed = number(usageResult.data?.manual_count);
  state.history = historyResult.data || [];

  renderPayoutMethod();
  renderInstantLimit();
  renderHistory(state.history);
  updateSubmitStates();
}

function validateSubmission(method, amount) {
  if (state.config.is_open !== true) {
    toast(state.config.closed_reason || 'Withdraw sedang tutup. Silakan ajukan kembali saat layanan buka.');
    return false;
  }
  if (!state.selectedMethod) {
    toast('Tambahkan rekening bank atau e-wallet di Pengaturan terlebih dahulu.');
    return false;
  }
  if (method === 'instant') {
    if (amount < 50000) { toast('Minimal withdraw instan adalah Rp50.000.'); return false; }
    const limit = number(state.config.instant_daily_limit || 500000);
    const remaining = Math.max(0, limit - number(state.instantUsed));
    if (amount > 500000 || amount > remaining) {
      toast(`Nominal melebihi sisa limit withdraw instan hari ini (${fmt(remaining)}).`);
      return false;
    }
  } else {
    if (amount < 100000) { toast('Minimal withdraw manual adalah Rp100.000.'); return false; }
    if (number(state.manualUsed) >= 5) { toast('Batas lima pengajuan withdraw manual hari ini sudah tercapai.'); return false; }
  }
  if (amount > state.balance) {
    toast(`Saldo tidak mencukupi. Kekurangan saldo ${fmt(amount - state.balance)}.`);
    return false;
  }
  const fee = number(method === 'instant' ? state.config.instant_fee ?? 13000 : state.config.manual_fee ?? 10000);
  const tax = number(state.config.tax_amount);
  if (amount <= fee + tax) {
    toast('Nominal withdraw harus lebih besar daripada total fee dan pajak.');
    return false;
  }
  const checkboxId = method === 'instant' ? 'instantTerms' : 'manualTerms';
  if (!$(checkboxId)?.checked) {
    toast('Centang persetujuan ketentuan withdraw terlebih dahulu.');
    return false;
  }
  return true;
}

async function submitWithdraw(method, form) {
  const amount = number(new FormData(form).get('amount'));
  if (!validateSubmission(method, amount)) return;

  const fee = number(method === 'instant' ? state.config.instant_fee ?? 13000 : state.config.manual_fee ?? 10000);
  const tax = number(state.config.tax_amount);
  const net = amount - fee - tax;
  const methodLabel = method === 'instant' ? 'Withdraw Instan' : 'Withdraw Manual';
  const destination = `${state.selectedMethod.provider} · ${state.selectedMethod.account_name} · ${state.selectedMethod.account_number}`;
  const confirmText = `${methodLabel}\nNominal: ${fmt(amount)}\nFee provider: ${fmt(fee)}\nPotongan pajak: ${fmt(tax)}\nDana bersih ditransfer: ${fmt(net)}\nTujuan: ${destination}\n\nLanjutkan pengajuan?`;
  if (!window.confirm(confirmText)) return;

  state.submitting = true;
  updateSubmitStates();
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
    document.querySelectorAll('[data-amount]').forEach(button => button.classList.remove('is-selected'));
    await loadData();
  } catch (error) {
    console.error('[BEARN withdraw submit]', error);
    toast(error.message || 'Pengajuan withdraw gagal. Silakan coba kembali.');
  } finally {
    state.submitting = false;
    updateSubmitStates();
  }
}

$('instantAmount')?.addEventListener('input', updateSubmitStates);
$('manualAmount')?.addEventListener('input', updateSubmitStates);
$('instantTerms')?.addEventListener('change', updateSubmitStates);
$('manualTerms')?.addEventListener('change', updateSubmitStates);
document.querySelectorAll('[data-amount]').forEach(button => {
  button.addEventListener('click', () => {
    $('instantAmount').value = button.dataset.amount;
    document.querySelectorAll('[data-amount]').forEach(item => item.classList.toggle('is-selected', item === button));
    updateSubmitStates();
  });
});
$('useAllBalance')?.addEventListener('click', () => {
  $('manualAmount').value = String(state.balance);
  updateSubmitStates();
});
$('instantWithdrawForm')?.addEventListener('submit', event => {
  event.preventDefault();
  submitWithdraw('instant', event.currentTarget);
});
$('manualWithdrawForm')?.addEventListener('submit', event => {
  event.preventDefault();
  submitWithdraw('manual', event.currentTarget);
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await init();
    await loadData();
  } catch (error) {
    console.error('[BEARN withdraw load]', error);
    const history = $('withdrawHistory');
    if (history) history.textContent = 'Riwayat belum dapat dimuat. Silakan muat ulang halaman.';
    const empty = $('payoutEmpty');
    if (empty) {
      empty.hidden = false;
      const paragraph = empty.querySelector('p');
      if (paragraph) paragraph.textContent = 'Data rekening belum dapat dimuat. Periksa koneksi dan sesi akun, lalu coba kembali.';
    }
  }
});
