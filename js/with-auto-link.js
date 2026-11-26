import { flowSlug, flowToken, flowRequest } from '/js/flow-session.js';

document.addEventListener('DOMContentLoaded', async () => {
  const slug = flowSlug();
  const token = flowToken(slug);
  const message = document.getElementById('accessMessage');
  const button = document.getElementById('openDestination');
  button.hidden = true;
  if (!token) {
    message.textContent = 'Sesi akses tidak ditemukan. Silakan mulai kembali dari halaman Go.';
    return;
  }
  try {
    const { status } = await flowRequest('/api/flow-status', { token });
    if (!status?.valid || !status.tag1 || !status.tag2 || !status.tag3) {
      throw new Error('Penyelesaian tiga tahap belum terverifikasi.');
    }
    message.textContent = 'Akses telah diverifikasi. Tekan tombol untuk menuju link tujuan.';
    button.href = `/api/auto-redirect?token=${encodeURIComponent(token)}`;
    button.hidden = false;
  } catch (error) {
    message.textContent = error.message || 'Verifikasi akses gagal.';
  }
});
