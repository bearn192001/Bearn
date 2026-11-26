import { init } from '/js/core.js';
import { COMMUNITY_LINKS, getAdminContact } from '/js/community.js';

const formatCount = value => new Intl.NumberFormat('id-ID').format(Number(value || 0));

function runTypewriter() {
  const node = document.getElementById('heroTypewriter');
  if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const words = ['Create', 'Share', 'Earn', 'Withdraw'];
  let wordIndex = 0, charIndex = words[0].length, deleting = true;
  node.textContent = words[0];
  const tick = () => {
    const word = words[wordIndex];
    if (deleting) {
      charIndex--;
      node.textContent = word.slice(0, Math.max(0, charIndex));
      if (charIndex <= 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        window.setTimeout(tick, 260);
        return;
      }
    } else {
      const next = words[wordIndex];
      charIndex++;
      node.textContent = next.slice(0, charIndex);
      if (charIndex >= next.length) {
        deleting = true;
        window.setTimeout(tick, 1050);
        return;
      }
    }
    window.setTimeout(tick, deleting ? 65 : 115);
  };
  window.setTimeout(tick, 1200);
}

function setupSocialSharing() {
  const url = encodeURIComponent(location.origin);
  const title = encodeURIComponent('BEARN — Create. Share. Earn. Withdraw.');
  const shareUrls = {
    whatsapp: `https://wa.me/?text=${title}%20${url}`,
    telegram: `https://t.me/share/url?url=${url}&text=${title}`,
    x: `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`
  };
  document.querySelectorAll('[data-share]').forEach(anchor => {
    const key = anchor.dataset.share;
    if (shareUrls[key]) anchor.href = shareUrls[key];
    else if (key === 'youtube' && COMMUNITY_LINKS.youtube) anchor.href = COMMUNITY_LINKS.youtube;
    else if (key === 'tiktok' && COMMUNITY_LINKS.tiktok) anchor.href = COMMUNITY_LINKS.tiktok;
    else if (key === 'instagram' && COMMUNITY_LINKS.instagram) anchor.href = COMMUNITY_LINKS.instagram;
  });
  document.getElementById('copyPageLink')?.addEventListener('click', async () => {
    const button = document.getElementById('copyPageLink');
    try {
      await navigator.clipboard.writeText(location.origin);
      button.querySelector('b').textContent = 'Tersalin!';
      window.setTimeout(() => button.querySelector('b').textContent = 'Salin Link', 1800);
    } catch {
      button.querySelector('b').textContent = 'Salin manual';
      window.prompt('Salin alamat BEARN ini:', location.origin);
    }
  });
}

function setupAdminContact() {
  const button = document.getElementById('adminContactButton');
  const target = getAdminContact();
  if (button && target) {
    button.href = target;
    button.target = '_blank';
    button.rel = 'noopener noreferrer';
  } else if (button) {
    button.href = '/help.html';
    button.removeAttribute('target');
    button.title = 'Tautan admin belum diatur. Buka halaman Bantuan.';
  }
}

async function loadPublicStats() {
  const client = window.BEARN?.client;
  const nodes = {
    users: document.querySelector('[data-stat="users"]'),
    shares: document.querySelector('[data-stat="shares"]'),
    withdrawals: document.querySelector('[data-stat="withdrawals"]')
  };
  if (!client) return;
  const { data, error } = await client.rpc('get_public_home_stats');
  if (error || !data) return; // Keep neutral placeholders if optional public stats SQL is not installed.
  if (nodes.users) nodes.users.textContent = formatCount(data.total_users);
  if (nodes.shares) nodes.shares.textContent = formatCount(data.total_shared_links);
  if (nodes.withdrawals) nodes.withdrawals.textContent = formatCount(data.total_paid_withdrawals);
}

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  runTypewriter();
  setupSocialSharing();
  setupAdminContact();
  await loadPublicStats();
});
