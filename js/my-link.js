import { init } from '/js/core.js';
import { loadMyLinks } from '/js/links.js';
document.addEventListener('DOMContentLoaded', async () => {
  await init();
  const type = new URLSearchParams(location.search).get('type');
  await loadMyLinks(type === 'auto' || type === 'payment' ? type : 'all');
});
