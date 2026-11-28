import { init, client, user, toast } from '/js/core.js';

const $ = id => document.getElementById(id);
let currentUser = null;

function renderMethods(rows) {
  const host = $('savedPayoutMethods');
  $('savedMethodCount').textContent = String(rows.length);
  if (!rows.length) { host.innerHTML = '<div class="empty">Belum ada rekening tersimpan. Tambahkan rekening untuk mulai withdraw.</div>'; return; }
  host.innerHTML = '';
  rows.forEach(row => {
    const card = document.createElement('article'); card.className = 'saved-method-card';
    const icon = document.createElement('span'); icon.className = 'saved-method-icon';
    icon.innerHTML = row.method_type === 'ewallet' ? '<i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i>' : '<i class="fa-solid fa-building-columns" aria-hidden="true"></i>';
    const info = document.createElement('div'); info.className = 'saved-method-info';
    const provider = document.createElement('b'); provider.textContent = row.provider;
    const name = document.createElement('span'); name.textContent = row.account_name;
    const account = document.createElement('small'); account.textContent = row.account_number;
    info.append(provider, name, account);
    const actions = document.createElement('div'); actions.className = 'saved-method-actions';
    if (row.is_default) {
      const badge = document.createElement('span'); badge.className = 'default-method-badge'; badge.textContent = 'UTAMA'; actions.append(badge);
    } else {
      const makeDefault = document.createElement('button'); makeDefault.type = 'button'; makeDefault.className = 'make-default-btn'; makeDefault.textContent = 'Jadikan utama';
      makeDefault.addEventListener('click', () => setDefault(row.id)); actions.append(makeDefault);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-method-btn'; remove.setAttribute('aria-label', `Hapus ${row.provider}`); remove.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
    remove.addEventListener('click', () => removeMethod(row)); actions.append(remove);
    card.append(icon, info, actions); host.append(card);
  });
}
async function loadMethods() {
  const { data, error } = await client.from('payout_methods').select('id,method_type,provider,account_name,account_number,is_default,created_at').eq('user_id', currentUser.id).eq('is_active', true).order('is_default', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  renderMethods(data || []);
}
async function setDefault(id) {
  const { error: clearError } = await client.from('payout_methods').update({ is_default: false }).eq('user_id', currentUser.id).eq('is_default', true);
  if (clearError) { toast(clearError.message); return; }
  const { error } = await client.from('payout_methods').update({ is_default: true }).eq('id', id).eq('user_id', currentUser.id);
  if (error) toast(error.message); else { toast('Rekening utama berhasil diperbarui.'); await loadMethods(); }
}
async function removeMethod(row) {
  if (!window.confirm(`Hapus rekening ${row.provider} (${row.account_number})?`)) return;
  const { error } = await client.from('payout_methods').delete().eq('id', row.id).eq('user_id', currentUser.id);
  if (error) { toast(error.message); return; }
  if (row.is_default) {
    const { data: next } = await client.from('payout_methods').select('id').eq('user_id', currentUser.id).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (next?.id) await client.from('payout_methods').update({ is_default: true }).eq('id', next.id).eq('user_id', currentUser.id);
  }
  toast('Rekening berhasil dihapus.'); await loadMethods();
}
$('payoutMethodForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const provider = String(data.get('provider') || '').trim();
  const accountName = String(data.get('account_name') || '').trim();
  const accountNumber = String(data.get('account_number') || '').trim();
  if (provider.length < 2 || accountName.length < 2 || accountNumber.length < 3) { toast('Lengkapi informasi rekening dengan benar.'); return; }
  const button = $('savePayoutMethod'); button.disabled = true;
  try {
    const { error } = await client.from('payout_methods').insert({
      user_id: currentUser.id,
      method_type: data.get('method_type'),
      provider,
      account_name: accountName,
      account_number: accountNumber,
      is_default: data.get('is_default') === 'on'
    });
    if (error) throw error;
    toast('Rekening berhasil disimpan.'); form.reset(); form.querySelector('[name="is_default"]').checked = true;
    await loadMethods();
  } catch (error) { console.error('[BEARN payout methods]', error); toast(error.message || 'Gagal menyimpan rekening.'); }
  finally { button.disabled = false; }
});

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  try {
    currentUser = await user();
    if (!client || !currentUser) throw new Error('Sesi login tidak tersedia. Silakan masuk kembali.');
    await loadMethods();
  } catch (error) {
    console.error('[BEARN settings]', error);
    $('savedPayoutMethods').innerHTML = '<div class="empty">Rekening belum dapat dimuat. Pastikan migrasi SQL withdraw sudah dijalankan.</div>';
    toast(error.message || 'Gagal memuat pengaturan rekening.');
  }
});
