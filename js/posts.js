import { init } from '/js/core.js';
import { loadPosts } from '/js/links.js';
document.addEventListener('DOMContentLoaded', async () => { await init(); await loadPosts(); });
