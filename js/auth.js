import { client } from '/js/core.js';

const STORAGE_KEY = 'bearn_saved_accounts_v1';
const $ = (id) => document.getElementById(id);
const readAccounts = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').filter(x => x && x.username && x.email); }
  catch { return []; }
};
function saveAccount(username, email) {
  const accounts = readAccounts().filter(x => x.username.toLowerCase() !== username.toLowerCase());
  accounts.unshift({ username, email, initial: username.trim().charAt(0).toUpperCase() || 'U' });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts.slice(0, 6)));
}
function notice(node, message, type = 'error') {
  if (!node) return;
  clearTimeout(node._hideTimer);
  node.textContent = message;
  node.className = `auth-float-notice is-visible ${type === 'success' ? 'is-success' : 'is-error'}`;
  node._hideTimer = setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => { if (!node.classList.contains('is-visible')) node.textContent = ''; }, 220);
  }, 2000);
}
function togglePasswordButtons() {
  document.querySelectorAll('[data-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const input = $(button.dataset.toggle);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.classList.toggle('is-shown', show);
      button.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    });
  });
}
function friendlyError(error) {
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) return 'Username atau kata sandi tidak sesuai.';
  if (msg.includes('email not confirmed')) return 'Email akun belum dikonfirmasi. Periksa pengaturan autentikasi.';
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'Gmail ini sudah terdaftar. Silakan masuk.';
  if (msg.includes('duplicate key') || msg.includes('username')) return 'Username sudah digunakan. Silakan pilih username lain.';
  return error?.message || 'Terjadi kesalahan. Silakan coba lagi.';
}
async function getUsername(user, fallback = '') {
  if (!user || !client) return fallback || user?.email?.split('@')[0] || 'member';
  const { data } = await client.from('profiles').select('username').eq('user_id', user.id).maybeSingle();
  return data?.username || user.user_metadata?.username || fallback || user.email?.split('@')[0] || 'member';
}
function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('is-loading', busy);
  if (busy) button.dataset.oldLabel = button.innerHTML;
  button.innerHTML = busy ? 'Memproses…' : (button.dataset.oldLabel || label);
}
function showSelectedAccount(account) {
  $('selectedUsername').textContent = account.username;
  $('selectedEmail').textContent = account.email;
  $('selectedAvatar').textContent = account.initial || account.username.charAt(0).toUpperCase();
  $('authForm').querySelector('[name="email"]').value = account.email;
  $('accountPicker').hidden = true;
  $('emailLoginForm').hidden = true;
  $('authForm').hidden = false;
  $('loginPassword').value = '';
  $('loginPassword').focus();
}
function renderAccounts(filter = '') {
  const list = $('savedAccounts');
  const allAccounts = readAccounts();
  const accounts = allAccounts.filter(x => x.username.toLowerCase().includes(filter.toLowerCase()));
  if (!list) return;
  list.innerHTML = '';
  $('emptyAccounts').hidden = accounts.length > 0;
  accounts.forEach(account => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'saved-account';
    button.innerHTML = `<span class="account-avatar">${(account.initial || account.username.charAt(0)).replace(/[<>&"']/g, '')}</span><span class="saved-account-copy"><b></b><small></small></span><span class="account-arrow">→</span>`;
    button.querySelector('b').textContent = account.username;
    button.querySelector('small').textContent = account.email;
    button.addEventListener('click', () => showSelectedAccount(account));
    list.append(button);
  });
}
async function completeLogin(email, password, usernameHint, noticeNode, button) {
  if (!client) { notice(noticeNode, 'Konfigurasi Supabase belum diisi.'); return; }
  setBusy(button, true, 'Masuk');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    const message = friendlyError(error);
    notice(noticeNode, message.includes('Username atau kata sandi') ? 'Kata sandi salah. Periksa kembali kata sandimu.' : message);
    setBusy(button, false, 'Masuk');
    return;
  }
  const username = await getUsername(data.user, usernameHint);
  saveAccount(username, data.user.email || email);
  notice(noticeNode, 'Masuk berhasil! Memverifikasi dan mengarahkan ke halaman…', 'success');
  setTimeout(() => { location.href = '/dashboard.html'; }, 2000);
}
export function bindAuth() {
  togglePasswordButtons();
  const loginForm = $('authForm');
  if (loginForm && loginForm.dataset.mode !== 'register') {
    renderAccounts();
    $('accountSearch')?.addEventListener('input', e => renderAccounts(e.target.value.trim()));
    $('accountSearch')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const match = readAccounts().find(x => x.username.toLowerCase() === e.currentTarget.value.trim().toLowerCase());
      if (match) showSelectedAccount(match);
      else notice($('usernameNotice'), 'Username tidak ditemukan. Periksa kembali atau masuk menggunakan email.');
    });
    $('accountSearch')?.addEventListener('change', e => {
      const value = e.target.value.trim();
      if (value && !readAccounts().some(x => x.username.toLowerCase() === value.toLowerCase()))
        notice($('usernameNotice'), 'Username tidak ditemukan. Periksa kembali username-mu.');
    });
    $('useEmailLogin')?.addEventListener('click', () => {
      $('accountPicker').hidden = true;
      $('authForm').hidden = true;
      $('emailLoginForm').hidden = false;
      $('loginEmail').focus();
    });
    const back = () => {
      $('authForm').hidden = true;
      $('emailLoginForm').hidden = true;
      $('accountPicker').hidden = false;
      $('loginPassword').value = '';
      $('emailPassword').value = '';
      if ($('accountSearch')) $('accountSearch').value = '';
      renderAccounts();
    };
    $('backToAccounts')?.addEventListener('click', back);
    $('changeAccount')?.addEventListener('click', back);
    $('backFromEmail')?.addEventListener('click', back);
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = loginForm.querySelector('[name="email"]').value;
      await completeLogin(email, $('loginPassword').value, $('selectedUsername').textContent, $('passwordNotice'), loginForm.querySelector('button[type="submit"]'));
    });
    $('emailLoginForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget;
      await completeLogin($('loginEmail').value.trim(), $('emailPassword').value, '', $('emailNotice'), form.querySelector('button[type="submit"]'));
    });
    return;
  }
  if (!loginForm || loginForm.dataset.mode !== 'register') return;
  const form = loginForm;
  const password = $('regPassword');
  const confirm = $('regConfirm');
  const strengthBar = $('strengthBar');
  const strengthLabel = $('strengthLabel');
  const confirmHint = $('confirmHint');
  const scorePassword = value => {
    let score = 0;
    if (value.length >= 8) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    if (value.length >= 12) score++;
    return value ? (score <= 2 ? 1 : score <= 3 ? 2 : 3) : 0;
  };
  password.addEventListener('input', () => {
    const score = scorePassword(password.value);
    strengthBar.className = `strength-level level-${score}`;
    strengthLabel.textContent = ['Belum diisi', 'Lemah', 'Sedang', 'Solid'][score];
    strengthLabel.className = `strength-text strength-${score}`;
    if (confirm.value) updateConfirm();
  });
  function updateConfirm() {
    if (!confirm.value) { confirmHint.textContent = ''; confirmHint.className = 'field-hint'; return; }
    const match = confirm.value === password.value;
    confirmHint.textContent = match ? 'Kata sandi cocok.' : 'Kata sandi belum cocok.';
    confirmHint.className = `field-hint ${match ? 'match' : 'mismatch'}`;
  }
  confirm.addEventListener('input', updateConfirm);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('regUsername').value.trim();
    const email = $('regEmail').value.trim().toLowerCase();
    const pass = password.value;
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) { notice($('registerNotice'), 'Username harus 3–24 karakter dan hanya boleh berisi huruf, angka, atau underscore.'); $('regUsername').focus(); return; }
    if (pass.length < 8) { notice($('registerNotice'), 'Kata sandi minimal 8 karakter.'); password.focus(); return; }
    if (pass !== confirm.value) { notice($('registerNotice'), 'Konfirmasi kata sandi tidak cocok.'); confirm.focus(); return; }
    if (!client) { notice($('registerNotice'), 'Konfigurasi Supabase belum diisi.'); return; }
    const submit = $('registerSubmit');
    setBusy(submit, true, 'Daftar sekarang');
    const { data, error } = await client.auth.signUp({
      email, password: pass,
      options: { data: { username, full_name: username } }
    });
    if (error) {
      notice($('registerNotice'), friendlyError(error));
      setBusy(submit, false, 'Daftar sekarang');
      return;
    }
    // Persist only the non-secret account identifier; never store the password.
    saveAccount(username, email);
    $('credentialUsername').textContent = username;
    $('credentialEmail').textContent = email;
    $('credentialPassword').textContent = pass;
    $('credentialModal').hidden = false;
    document.body.classList.add('modal-open');
    setBusy(submit, false, 'Daftar sekarang');
    $('continueToLogin').addEventListener('click', () => { location.href = '/login.html'; }, { once: true });
    $('saveCredentialImage').addEventListener('click', async () => {
      const saveButton = $('saveCredentialImage');
      if (!window.html2canvas) { notice($('registerNotice'), 'Fitur screenshot belum dapat dimuat. Coba lagi.'); return; }
      saveButton.disabled = true;
      saveButton.textContent = 'Menyiapkan screenshot…';
      try {
        const canvas = await window.html2canvas($('credentialCard'), { backgroundColor: '#ffffff', scale: 2, useCORS: true });
        const link = document.createElement('a');
        link.download = `BEARN-akun-${username}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        saveButton.textContent = 'Screenshot tersimpan';
      } catch {
        saveButton.textContent = 'Coba simpan screenshot lagi';
        saveButton.disabled = false;
      }
    }, { once: true });
  });
}
