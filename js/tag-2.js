import { flowSlug, flowToken, flowRequest } from '/js/flow-session.js';

document.addEventListener('DOMContentLoaded', () => {
  const slug = flowSlug();
  const button = document.getElementById('completeTag');
  const note = document.getElementById('tagMessage');
  const token = flowToken(slug);
  if (!token) {
    button.disabled = true;
    note.textContent = 'Sesi tidak ditemukan. Kembali ke halaman Go untuk memulai lagi.';
    return;
  }
  button?.addEventListener('click', async () => {
    button.disabled = true;
    note.textContent = 'Menyimpan tahap 2…';
    try {
      await flowRequest('/api/flow-complete', { token, stage: 2 });
      location.href = `/tag-3.html?slug=${encodeURIComponent(slug)}`;
    } catch (error) {
      note.textContent = error.message;
      button.disabled = false;
    }
  });
});
