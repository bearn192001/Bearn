import { flowSlug, flowToken, flowRequest } from '/js/flow-session.js';

document.addEventListener('DOMContentLoaded', async () => {
  const slug = flowSlug();
  const token = flowToken(slug);
  const checklist = document.getElementById('tagChecklist');
  const go = document.getElementById('directButton');
  const retry = document.getElementById('retryButton');
  const note = document.getElementById('finalMessage');
  if (!token) {
    checklist.innerHTML = '<li>× Sesi tidak ditemukan</li>';
    note.textContent = 'Kembali ke halaman Go untuk memulai sesi baru.';
    retry.href = `/go.html?slug=${encodeURIComponent(slug)}`;
    retry.classList.remove('hidden');
    return;
  }
  try {
    const { status } = await flowRequest('/api/flow-status', { token });
    if (!status?.valid) throw new Error('Sesi tidak valid atau sudah kedaluwarsa.');
    const values = [status.tag1 === true, status.tag2 === true, status.tag3 === true];
    checklist.innerHTML = values.map((done, i) => `<li>${done ? '✓' : '×'} Tag ${i + 1} — ${done ? 'Selesai' : 'Belum selesai'}</li>`).join('');
    if (values.every(Boolean)) {
      go.href = `/with-auto-link.html?slug=${encodeURIComponent(slug)}`;
      go.classList.remove('hidden');
      note.textContent = 'Semua tahap sudah tercatat di server. Tekan tombol untuk melanjutkan ke tujuan.';
    } else {
      retry.href = `/tag-${values[0] ? (values[1] ? 3 : 2) : 1}.html?slug=${encodeURIComponent(slug)}`;
      retry.classList.remove('hidden');
      note.textContent = 'Ada tahap yang belum selesai. Selesaikan tahap sesuai urutan.';
    }
  } catch (error) {
    checklist.innerHTML = '<li>× Verifikasi sesi gagal</li>';
    note.textContent = error.message;
    retry.href = `/go.html?slug=${encodeURIComponent(slug)}`;
    retry.classList.remove('hidden');
  }
});
