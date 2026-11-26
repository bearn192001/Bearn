import { init } from '/js/core.js';
import { loadMyLinks } from '/js/links.js';
document.addEventListener('DOMContentLoaded', async () => { await init(); await loadMyLinks(); });
